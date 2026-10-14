# Zunftküche Dataverse plug-in package

Contains `KitchenLoadPlugin`, `KitchenCommitPlugin`, and `KitchenWriteGuardPlugin` for a stable workspace aggregate with optimistic concurrency and immutable operation receipts. The package includes its Newtonsoft.Json runtime dependency and excludes Microsoft SDK assemblies.

Register the global Custom APIs and every supported direct-write guard before granting ordinary-user access. Provision the reviewed schema-2 workspace separately. Both editors require full-document kitchen-edit permission. Readers have workspace Read only. Never configure SYSTEM execution or bypass privileges.

The project provides registration definitions and a German deployment guide under `docs/deployment.md`. Local compilation and fake-service tests do not establish Dataverse transaction or permission acceptance. Deployment remains blocked until the environment/access-group decision is approved.
