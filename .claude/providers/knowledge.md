# Business Knowledge

Status: **NOT STARTED** for Pinecone or another external retrieval/index provider.

- Business Knowledge remains the business-facing authority; retrieval vendor, index,
  namespace, credential, and embedding details remain backend/admin concerns.
- Every index or namespace mapping must be trusted, server-managed, and tenant-scoped.
- Knowledge create, update, deactivate, and delete operations require explicit provider
  synchronization and reconciliation behavior.
- Cross-workspace retrieval, indexing, filtering, or namespace access must be impossible.
- Client DTOs expose business content and safe sync state, not provider infrastructure.
- Do not implement or connect a knowledge provider until explicitly assigned.
