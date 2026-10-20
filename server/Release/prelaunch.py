"""Independent copied round4 gate: verify this launcher against a separately reviewed literal SHA256 BEFORE running it.
A candidate-generated manifest is never its own trust authority. No candidate Python imports or .NET loads before closure verification.
"""
import argparse, hashlib, json, os, re, sys
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path('/Users/sorenkube/Documents/Codex/2026-10-14/das/work/zunftkueche-app')
RELEASE='server/Release'
DOTNET=Path('/Users/sorenkube/Documents/Codex/2026-10-14/das/work/dotnet')
RUNTIME=RELEASE+'/release/reviewed'
SOURCE_FILES=frozenset(['server/README.md', 'server/Documents/schema-proposal.json', 'server/Documents/README.md', 'server/Release/Tests/PhaseTests.cs', 'server/Release/Tests/ActivationIntegrationTests.cs', 'server/Release/Tests/GuardHarness/GuardHarness.csproj', 'server/Release/Tests/GuardHarness/packages.lock.json', 'server/DataverseBackup.cs', 'server/Documents/DataverseDocuments.cs', 'server/Documents/DocumentProtocol.cs', 'server/Intake/ReceiptIntake.cs', 'server/Kitchen.Dataverse.csproj', 'server/Plugins.cs', 'server/Policy/BackupProtocol.cs', 'server/Policy/EconomicHistory.cs', 'server/Policy/Protocol.cs', 'server/Policy/ReceivingClose.cs', 'server/Policy/StatePolicy.cs', 'server/Release/.gitignore', 'server/Release/ActivationContracts.cs', 'server/Release/ActivationCore.cs', 'server/Release/Authentication.cs', 'server/Release/Backup.cs', 'server/Release/Core.cs', 'server/Release/DocumentGuards.cs', 'server/Release/DocumentSchema.cs', 'server/Release/Inventory.cs', 'server/Release/Kitchen.Release.csproj', 'server/Release/Metadata.cs', 'server/Release/NuGet.Config', 'server/Release/PackageActivation.cs', 'server/Release/Program.cs', 'server/Release/README.md', 'server/Release/Reader.cs', 'server/Release/ReleaseContract.cs', 'server/Release/ReleaseInventory.cs', 'server/Release/Tests/AcceptedActivationTests.cs', 'server/Release/Tests/ContextProxy.cs', 'server/Release/Tests/GuardMappingTests.cs', 'server/Release/Tests/Program.cs', 'server/Release/Tests/Tests.csproj', 'server/Release/Tests/fixtures/prior-v5.nupkg', 'server/Release/Tests/packages.lock.json', 'server/Release/Tests/test_prelaunch.py', 'server/Release/contracts/platform-intrinsics.json', 'server/Release/global.json', 'server/Release/packages.lock.json', 'server/Release/prelaunch.py', 'server/Release/provenance.json', 'server/packages.lock.json'])
CLIENT_FILES=frozenset(['.power/schemas/appschemas/dataSourcesInfo.ts', '.power/schemas/dataverse/zk_KitchenCommit.Schema.json', '.power/schemas/dataverse/zk_KitchenLoad.Schema.json', 'index.html', 'package-lock.json', 'package.json', 'power.config.json', 'src/App.tsx', 'src/bootstrap/microsoft.ts', 'src/bootstrap/screen.ts', 'src/bootstrap/start.ts', 'src/components/AllocationEditor.tsx', 'src/components/BackupPanel.tsx', 'src/components/CorrectionDialog.tsx', 'src/components/DiscardChangesDialog.tsx', 'src/components/DocumentPreview.tsx', 'src/components/EventClosure.tsx', 'src/components/MobileItemCard.tsx', 'src/components/NetEvidenceEditor.tsx', 'src/components/ReceivingList.tsx', 'src/components/shared.tsx', 'src/data/backup.ts', 'src/data/document-runtime.ts', 'src/data/documents.ts', 'src/data/exports.ts', 'src/data/microsoft-repository.ts', 'src/data/microsoft-runtime.ts', 'src/data/preferences.ts', 'src/data/repository.ts', 'src/data/save-controller.ts', 'src/data/sharepoint-documents.ts', 'src/domain/corrections.ts', 'src/domain/event-close.ts', 'src/domain/event-context.ts', 'src/domain/kitchen.ts', 'src/domain/locations.ts', 'src/domain/order-status.ts', 'src/domain/receipt-draft.ts', 'src/domain/receiving.ts', 'src/domain/state.ts', 'src/domain/workflow.ts', 'src/generated/index.ts', 'src/generated/models/SharePointModel.ts', 'src/generated/models/Zk_KitchenCommitModel.ts', 'src/generated/models/Zk_KitchenLoadModel.ts', 'src/generated/services/SharePointService.ts', 'src/generated/services/Zk_KitchenCommitService.ts', 'src/generated/services/Zk_KitchenLoadService.ts', 'src/hooks/useDraftGuard.ts', 'src/main.tsx', 'src/ocr/engine.ts', 'src/ocr/local-image.ts', 'src/ocr/local-text.ts', 'src/ocr/receipt-parser.ts', 'src/screens/Analysis.tsx', 'src/screens/Deliveries.tsx', 'src/screens/Home.tsx', 'src/screens/Masters.tsx', 'src/screens/Orders.tsx', 'src/screens/Planning.tsx', 'src/screens/ReceiptIntake.tsx', 'src/screens/ReceiptReview.tsx', 'src/screens/Receipts.tsx', 'src/screens/Settings.tsx', 'src/styles.css', 'src/ui/draft-guard.ts', 'src/ui/facts.ts', 'src/ui/kitchen-editing.ts', 'src/ui/order-selection.ts', 'src/ui/receipt-acceptance.ts', 'src/ui/receipt-display.ts', 'src/ui/receipt-intake-draft.ts', 'src/ui/settings-mappings.ts', 'src/vite-env.d.ts', 'tsconfig.json', 'vite.config.ts'])
COMPILE=['Program.cs', 'ReleaseContract.cs', 'DocumentSchema.cs', 'DocumentGuards.cs', 'PackageActivation.cs', 'ActivationContracts.cs', 'ActivationCore.cs', 'Authentication.cs', 'Core.cs', 'Reader.cs', 'Inventory.cs', 'Metadata.cs', 'Backup.cs', 'ReleaseInventory.cs', '../Policy/StatePolicy.cs', '../Policy/EconomicHistory.cs', '../Policy/Protocol.cs', '../Policy/BackupProtocol.cs', '../Policy/ReceivingClose.cs', '../Documents/DocumentProtocol.cs', '../Intake/ReceiptIntake.cs']
BUILD_FILES=frozenset(RUNTIME+'/'+n for n in ['Kitchen.Release.dll','Kitchen.Release.pdb','Kitchen.Release.deps.json','Kitchen.Release.runtimeconfig.json','Microsoft.Identity.Client.dll','Microsoft.IdentityModel.Abstractions.dll','Newtonsoft.Json.dll'])
HOST_DIRS=['host/fxr/8.0.32','shared/Microsoft.NETCore.App/8.0.32']
class Rejected(Exception):
    pass

def require(value):
    if not value:
        raise Rejected('prelaunch_rejected')

def digest(data):
    return hashlib.sha256(data).hexdigest()

def unique(pairs):
    result = {}
    for name, value in pairs:
        require(name not in result)
        result[name] = value
    return result

def trusted_bytes(root, relative):
    require(isinstance(relative,str) and relative and not Path(relative).is_absolute())
    require(all(part not in ('','..','.') for part in relative.split('/')))
    path = root / relative
    for ancestor in [path, *path.parents]:
        require(not ancestor.is_symlink())
    require(path.is_file())
    return path.read_bytes()

def load_pinned(root, name, pin):
    require(isinstance(pin,str) and re.fullmatch('[0-9a-f]{64}',pin))
    raw = trusted_bytes(root,name)
    require(digest(raw) == pin)
    result = json.loads(raw, object_pairs_hook=unique)
    require(isinstance(result,dict))
    return result

def entries(root, manifest, required):
    rows = manifest.get('files')
    require(isinstance(rows,list))
    found = set()
    for row in rows:
        require(isinstance(row,dict) and set(row) == {'path','bytes','sha256'})
        path = row['path']
        require(isinstance(path,str) and path in required and path not in found)
        found.add(path)
        require(type(row['bytes']) is int and row['bytes'] >= 0)
        require(isinstance(row['sha256'],str) and re.fullmatch('[0-9a-f]{64}',row['sha256']))
        raw = trusted_bytes(root,path)
        require(len(raw)==row['bytes'] and digest(raw)==row['sha256'])
    require(found == required)


def tree(root,prefix):
    result=set()
    for p in (root/prefix).rglob('*'):
        require(not p.is_symlink())
        if p.is_file(): result.add(p.relative_to(root).as_posix())
    return result

def verify(root,host,source_pin,build_pin,host_pin,client_pin,originals_pin=None):
    source=load_pinned(root,RELEASE+'/source-manifest.json',source_pin)
    build=load_pinned(root,RELEASE+'/build-manifest.json',build_pin)
    runtime=load_pinned(root,RELEASE+'/host-manifest.json',host_pin)
    client=load_pinned(root,RELEASE+'/client-manifest.json',client_pin)
    entries(root,source,SOURCE_FILES)
    entries(root,build,BUILD_FILES)
    require(tree(root,RUNTIME)==BUILD_FILES)
    require(build.get('sourceManifestSha256')==source_pin)
    project=ET.fromstring(trusted_bytes(root,RELEASE+'/Kitchen.Release.csproj'))
    require([e.attrib.get('Include') for e in project.findall('.//Compile')]==COMPILE)
    require([e.attrib.get('Include') for e in project.findall('.//EmbeddedResource')]==['contracts/platform-intrinsics.json'])
    require(project.findtext('.//EnableDefaultCompileItems')=='false' and project.findtext('.//UseAppHost')=='false')
    require(source.get('compileInputs')==COMPILE)
    # Enumerate scopes, so newly injected source/resource/project/lock files cannot hide behind an old manifest.
    actual=set()
    for p in (root/RELEASE).rglob('*'):
        relative=p.relative_to(root).as_posix(); local=p.relative_to(root/RELEASE).parts
        if any(x in local for x in ('bin','obj','release','backups','attempts','review','.runs','__pycache__')): continue
        require(not p.is_symlink())
        if p.is_file() and p.name not in ('source-manifest.json','build-manifest.json','host-manifest.json','client-manifest.json'): actual.add(relative)
    require(actual=={p for p in SOURCE_FILES if p.startswith(RELEASE+'/')})
    for scope in ['server/Policy','server/Documents','server/Intake']:
        require(tree(root,scope)=={p for p in SOURCE_FILES if p.startswith(scope+'/')})
    host_files={'dotnet'}
    for scope in HOST_DIRS: host_files.update(tree(host,scope))
    entries(host,runtime,host_files)
    require(runtime.get('framework')=='8.0.32')
    config=json.loads(trusted_bytes(root,RUNTIME+'/Kitchen.Release.runtimeconfig.json'),object_pairs_hook=unique)
    framework=config['runtimeOptions']['framework']
    require(framework=={'name':'Microsoft.NETCore.App','version':'8.0.32'})
    require(config['runtimeOptions'].get('rollForward')=='Disable')
    require(tree(root,'src')|tree(root,'.power')=={p for p in CLIENT_FILES if p.startswith(('src/','.power/'))})
    dist=tree(root,'dist');require(dist and 'dist/index.html' in dist)
    entries(root,client,CLIENT_FILES|dist)
    cfg=json.loads(trusted_bytes(root,'power.config.json'),object_pairs_hook=unique)
    require(cfg.get('appId')=='bfec495e-c223-4176-89a8-3e4d631337ae' and cfg.get('environmentId')=='5684204c-3254-ec15-93f4-276ec50cc65b' and cfg.get('buildPath')=='./dist')
    if originals_pin:
        originals=load_pinned(root,RELEASE+'/review/originals-manifest.json',originals_pin)
        require(isinstance(originals.get('originals'),list))
        for o in originals['originals']:
            f=o['Bytes'];raw=trusted_bytes(root/RELEASE/'review',f['RelativePath'])
            require(len(raw)==f['Length'] and digest(raw)==f['Sha256'])
    return True

class SafeParser(argparse.ArgumentParser):
    def error(self,message): raise Rejected('prelaunch_arguments_rejected')
def main():
    parser=SafeParser()
    for key in ['source','build','host','client']: parser.add_argument('--'+key+'-sha256',required=True)
    parser.add_argument('--originals-sha256')
    parser.add_argument('--mode',choices=['plan','inspect','backup','provision-document-schema','activate-package','register-document-guards','verify-release'],default='plan')
    try:
        args=parser.parse_args()
        verify(ROOT,DOTNET,args.source_sha256,args.build_sha256,args.host_sha256,args.client_sha256,args.originals_sha256)
        # Injection settings are rejected before any execution, not silently interpreted as configuration.
        require(not any(k.startswith(('DOTNET_STARTUP_HOOKS','DOTNET_ADDITIONAL_DEPS','DOTNET_SHARED_STORE','CORECLR_','COMPlus_','DYLD_','LD_')) for k in os.environ))
    except Exception:
        print('PRELAUNCH_REJECTED: no candidate/authentication loaded.',file=sys.stderr);return 2
    if args.mode=='plan':
        print('PLAN_VERIFIED_OFFLINE: source/build/host/client closure; no candidate/authentication loaded. Native release gates remain open.');return 0
    environment={k:v for k,v in os.environ.items() if not k.startswith(('DOTNET_','CORECLR_','COMPlus_','MSBUILD','DYLD_','LD_','KITCHEN_REVIEW_'))}
    for key in ['source','build','host','client']:environment['KITCHEN_REVIEW_'+key.upper()+'_SHA256']=getattr(args,key+'_sha256')
    if args.originals_sha256:environment['KITCHEN_REVIEW_ORIGINALS_SHA256']=args.originals_sha256
    environment.update(DOTNET_ROOT=str(DOTNET),DOTNET_ROLL_FORWARD='Disable',DOTNET_CLI_TELEMETRY_OPTOUT='1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1')
    os.execve(str(DOTNET/'dotnet'),[str(DOTNET/'dotnet'),str(ROOT/RUNTIME/'Kitchen.Release.dll'),args.mode],environment)
if __name__=='__main__':sys.exit(main())
