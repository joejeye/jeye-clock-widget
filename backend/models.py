from typing import Optional
from sqlmodel import Field, SQLModel
from datetime import datetime

class Todo(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    text: str
    completed: bool = False
    archived: bool = False
    createdAt: str = Field(default_factory=lambda: datetime.now().isoformat())
