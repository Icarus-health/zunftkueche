using Kitchen.Inventory;
namespace Kitchen.Release;
public static class Program
{
    public static async Task<int> Main(string[] args) {
        var authObservation=new AuthObservation();
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
            if(mode==ReleaseMode.VerifyRelease && ReviewedRelease.FinalVerification==null){Console.WriteLine("STOPPED_BEFORE_AUTH: final v2 package verification pin missing; independent from activation catalog.");return 2;}
            if(mode==ReleaseMode.VerifyRelease) {
                ReleaseScope.RequireProduction(ReviewedRelease.FinalVerification!.ExpectedScope);
                _=ReviewedRelease.FinalVerification.Verify(root);
            }
            if(mode is ReleaseMode.Inspect or ReleaseMode.Backup or ReleaseMode.VerifyRelease) {
                var backup=new Backup(Path.Combine(root,"backups"));
                var status=new RunStatus{Backup=backup};
                try {
                    status.Stage=FailureStage.Authentication;
                    authObservation.Mark(AuthBoundary.Construction);
                    var auth=new Authentication();await auth.SignIn(authObservation.Mark);
                    authObservation.Mark(AuthBoundary.NativePreparation);
                    using var reader=new Reader(auth.Token,backup.Write);
                    var inspector=new ReleaseInspector(reader,backup,auth.ObjectId,status,mode==ReleaseMode.VerifyRelease?ReviewedRelease.FinalVerification!.ExpectedScope:ReviewedRelease.InspectionScope);
                    authObservation.Mark(AuthBoundary.Native);
                    var complete=await inspector.Inspect(mode==ReleaseMode.Backup,root);
                    if(mode==ReleaseMode.VerifyRelease){await ReadOnlyReleaseVerification.ReadServerBackup(reader,auth.Token,ReviewedRelease.FinalVerification!,root,new Backup(Path.Combine(root,"backups")));}
                    Console.WriteLine(complete?"CURRENT_NATIVE_BACKUP_COMPLETE: reviewed installed-source coverage and exact originals; final release acceptance remains open.":"INSPECTION_RETAINED_INCOMPLETE: native inventory; current completeness/original evidence missing. Final release acceptance is separate.");return mode==ReleaseMode.Backup&&!complete?2:0;
                } catch(Exception error){backup.RecordFailure(status.Stage,error is Stop s?s.Reason:FailureReason.OperationFailed,authObservation.Describe(error));throw;}
            }
            var phase=ReviewedRelease.Phases.Single(p=>p.Mode==mode);
            // Validate all externally pinned evidence BEFORE constructing authentication.
            _=phase.Plan.Verify(root);_=phase.Review.Verify(root);_=phase.Checkpoint.Verify(root);
            var phaseScope=ReleaseScope.Phase(phase);if(phaseScope!=null)ReleaseScope.RequireProduction(phaseScope);
            if(PhaseRoutePrerequisites.Required(phase))_=PhaseRoutePrerequisites.Load(phase,root);
            var mutationCapture=new Backup(Path.Combine(root,"backups"));
            authObservation.Mark(AuthBoundary.Construction);
            var phaseAuth=new Authentication();await phaseAuth.SignIn(authObservation.Mark);
            authObservation.Mark(AuthBoundary.NativePreparation);
            using var phaseReader=new Reader(phaseAuth.Token,mutationCapture.Write);
            var phaseInspector=new Inspector(phaseReader,mutationCapture,phaseAuth.ObjectId);
            authObservation.Mark(AuthBoundary.Native);
            await phaseInspector.Run(false);
            return await PhaseDispatch.Run(mode,phase,root,phaseReader,phaseAuth.Token,mutationCapture);
        } catch(Exception error) {Console.Error.WriteLine("RELEASE_STOPPED: incomplete or invalid contract/evidence; no retry or repair performed.");if(authObservation.Boundary!=AuthBoundary.NotEntered)Console.Error.WriteLine("AUTH_DIAGNOSTIC "+authObservation.Describe(error).SafeJson());return 2;}
    }
}
