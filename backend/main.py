import os
import yaml
import secrets
from contextlib import asynccontextmanager
from typing import List

import httpx
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from dotenv import load_dotenv

from models import Todo
from database import create_db_and_tables, get_session

# Load env
load_dotenv()

# Load config
try:
    with open("config.yaml") as f:
        config = yaml.safe_load(f)
except FileNotFoundError:
    config = {}

PORT = config.get("port", 8000)
API_KEY = os.getenv("OPENWEATHER_API_KEY")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")

security = HTTPBasic()

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    current_username_bytes = credentials.username.encode("utf8")
    correct_username_bytes = ADMIN_USERNAME.encode("utf8")
    is_correct_username = secrets.compare_digest(
        current_username_bytes, correct_username_bytes
    )
    
    current_password_bytes = credentials.password.encode("utf8")
    correct_password_bytes = ADMIN_PASSWORD.encode("utf8")
    is_correct_password = secrets.compare_digest(
        current_password_bytes, correct_password_bytes
    )
    
    if not (is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
@app.get("/api/todos", response_model=List[Todo])
def read_todos(session: Session = Depends(get_session), username: str = Depends(get_current_username)):
    # Sort by ID desc (newest first) to match original behavior roughly
    # Original behavior was unshift() -> newest at top.
    todos = session.exec(select(Todo).order_by(Todo.id.desc())).all()
    return todos

@app.post("/api/todos", response_model=Todo)
def create_todo(todo: Todo, session: Session = Depends(get_session), username: str = Depends(get_current_username)):
    session.add(todo)
    session.commit()
    session.refresh(todo)
    return todo

@app.put("/api/todos/{todo_id}", response_model=Todo)
def update_todo(todo_id: int, todo_update: Todo, session: Session = Depends(get_session), username: str = Depends(get_current_username)):
    todo = session.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # Update fields
    todo.text = todo_update.text
    todo.completed = todo_update.completed
    todo.archived = todo_update.archived
    todo.meta_data = todo_update.meta_data
    # We don't update createdAt usually
    
    session.add(todo)
    session.commit()
    session.refresh(todo)
    return todo

@app.delete("/api/todos/{todo_id}")
def delete_todo(todo_id: int, session: Session = Depends(get_session), username: str = Depends(get_current_username)):
    todo = session.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    session.delete(todo)
    session.commit()
    return {"ok": True}

@app.get("/api/weather")
async def get_weather(lat: float, lon: float, units: str = "metric"):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API Key not configured")
    
    url = "https://api.openweathermap.org/data/3.0/onecall"
    params = {
        "lat": lat,
        "lon": lon,
        "appid": API_KEY,
        "units": units
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params)
        if resp.status_code != 200:
             # Pass through error or generic
             raise HTTPException(status_code=resp.status_code, detail="Weather API Error")
        return resp.json()

# Mount static files
# Priority: /app/static (Docker), ../frontend (Local dev)
static_dir = "../frontend"
if os.path.exists("static"): 
    static_dir = "static" # Docker specific copy

if not os.path.exists(static_dir) and not os.path.exists("static"):
     print(f"Warning: Static directory not found at {static_dir}")

app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
