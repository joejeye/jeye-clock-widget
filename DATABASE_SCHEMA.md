# Database Schema

The database table schema (SQLModel) is defined in [backend/models.py](backend/models.py). 

The primary table is named `todo`. Key columns include:
- `id` (Integer, PK)
- `text` (String)
- `completed` (Boolean)
- `archived` (Boolean)
- `createdAt` (String/ISO DateTime)
- `meta_data` (JSON/Dictionary):
    - `importance` (Optional String): `critical`, `major`, `moderate`, `minor`, or `trivial`.
    - `dueTime` (Optional Integer): Unix timestamp in seconds.
    - `completedAt` (Optional Integer): Unix timestamp in seconds (when marked completed).
