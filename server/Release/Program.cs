using Kitchen.Inventory;
namespace Kitchen.Release;
public static class Program
{
    public static async Task<int> Main(string[] args) {
        try {
            var mode=ModeParser.Parse(args); // Never construct auth/transport before this closed parser.
            if(mode==ReleaseMode.Plan) {
                foreach(var table in Enum.GetValues<TableKind>()) {
                    _=DocumentSchema.Table(table);_ = DocumentSchema.Relationship(table);
                    foreach(var column in Enum.GetValues<ColumnKind>())_ = DocumentSchema.Column(column);
                }
                Console.WriteLine("PLAN_OFFLINE: fixed contracts valid; no authentication/transport constructed. Live closure requires independently pinned prelaunch. Release incomplete: "+ReviewedRelease.Pending);
                return 0;
            }
            var root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"..",".."));
            ReleaseClosure.RequirePrelaunch(root);
            if(mode is not (ReleaseMode.Inspect or ReleaseMode.Backup or ReleaseMode.VerifyRelease) && !ReviewedRelease.CanExecute(mode)) {
                Console.WriteLine("STOPPED_BEFORE_AUTH: no independently reviewed executable phase. "+ReviewedRelease.Pending);return 2;
            }
            if(mode==ReleaseMode.VerifyRelease && ReviewedRelease.FinalVerificationPackage==null){Console.WriteLine("STOPPED_BEFORE_AUTH: final v2 package verification pin missing; independent from activation catalog.");return 2;}
            if(mode is ReleaseMode.Inspect or ReleaseMode.Backup or ReleaseMode.VerifyRelease) {
                var backup=new Backup(Path.Combine(root,"backups"));
                var status=new RunStatus{Backup=backup};
                try {
                    var auth=new Authentication();await auth.SignIn();
                    using var reader=new Reader(auth.Token,backup.Write);
                    var complete=await new ReleaseInspector(reader,backup,auth.ObjectId,status).Inspect(mode==ReleaseMode.Backup,root);
                    if(mode==ReleaseMode.VerifyRelease){await ReadOnlyReleaseVerification.ReadServerBackup(reader,auth.Token,ReviewedRelease.FinalVerificationPackage!,root,new Backup(Path.Combine(root,"backups")));}
                    Console.WriteLine(complete?"CURRENT_NATIVE_BACKUP_COMPLETE: reviewed installed-source coverage and exact originals; final release acceptance remains open.":"INSPECTION_RETAINED_INCOMPLETE: native inventory; current completeness/original evidence missing. Final release acceptance is separate.");return mode==ReleaseMode.Backup&&!complete?2:0;
                } catch(Stop s){backup.RecordFailure(status.Stage,s.Reason);throw;}
                  catch{backup.RecordFailure(status.Stage,FailureReason.OperationFailed);throw;}
            }
            var phase=ReviewedRelease.Phases.Single(p=>p.Mode==mode);
            // Validate all externally pinned evidence BEFORE constructing authentication.
            _=phase.Plan.Verify(root);_=phase.Review.Verify(root);_=phase.Checkpoint.Verify(root);
            var mutationCapture=new Backup(Path.Combine(root,"backups"));
            var phaseAuth=new Authentication();await phaseAuth.SignIn();
            using var phaseReader=new Reader(phaseAuth.Token,mutationCapture.Write);
            await new Inspector(phaseReader,mutationCapture,phaseAuth.ObjectId).Run(false);
            return await PhaseDispatch.Run(mode,phase,root,phaseReader,phaseAuth.Token,mutationCapture);
        } catch {Console.Error.WriteLine("RELEASE_STOPPED: incomplete or invalid contract/evidence; no retry or repair performed.");return 2;}
    }
}
