# Database Query API

This project provides a read-only SQL query endpoint for advanced data retrieval. This feature is primarily intended for host machine integration and data analysis.

## Endpoint

- **Path:** `/api/query`
- **Method:** `POST`
- **Authentication:** HTTP Basic Auth (same as Todo API)

## Request Format

The endpoint expects a JSON object containing a `query` string.

```json
{
  "query": "SELECT * FROM todo WHERE completed = 1 ORDER BY createdAt DESC LIMIT 5"
}
```

## Database Schema

The database table schema (SQLModel) is defined in [backend/models.py](backend/models.py). 

The primary table is named `todo`. Key columns include:
- `id` (Integer, PK)
- `text` (String)
- `completed` (Boolean)
- `archived` (Boolean)
- `createdAt` (String/ISO DateTime)
- `meta_data` (JSON/Dictionary)

## Example Usage (curl)

### macOS / Linux / Git Bash
```bash
curl -X POST "http://localhost:19563/api/query" \
     -u "admin:your_password" \
     -H "Content-Type: application/json" \
     -d "{\"query\": \"SELECT * FROM todo WHERE archived = 0\"}"
```

### Windows (PowerShell)
PowerShell often breaks JSON strings with spaces. Use the stop-parsing symbol `--%` to pass arguments literally to `curl.exe`:

```powershell
curl.exe --% -X POST "http://localhost:19563/api/query" -u "admin:your_password" -H "Content-Type: application/json" -d "{\"query\": \"SELECT * FROM todo WHERE archived = 0\"}"
```

## Security & Constraints

1.  **Read-Only Enforcement:** The connection to the SQLite database is established with `mode=ro`. Any attempt to execute `INSERT`, `UPDATE`, `DELETE`, or other data-modifying statements will result in a `400 Bad Request` with an "attempt to write a readonly database" error.
2.  **Authentication:** Access is restricted to authorized users via Basic Auth.
3.  **Deployment:** While available in all deployments, this is specifically useful for local Docker Compose setups to allow the host to inspect data without direct file access.

