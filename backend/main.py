import logging
import os
import yaml
import secrets
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
import sqlite3
from pathlib import Path

import httpx
from pydantic import BaseModel
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

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# Weather caching / upstream request throttling.
# We intentionally limit outbound OpenWeather calls to at most once
# every 5 minutes per normalized location+unit key.
WEATHER_CACHE_TTL_SECONDS = 5 * 60
WEATHER_COORD_PRECISION = 3  # ~100m precision; smooths minor geolocation jitter
weather_cache: Dict[Tuple[float, float, str], Dict[str, Any]] = {}
weather_cache_locks: Dict[Tuple[float, float, str], asyncio.Lock] = {}
weather_cache_guard = asyncio.Lock()

security = HTTPBasic()


def _normalize_weather_key(lat: float, lon: float, units: str) -> Tuple[float, float, str]:
    return (round(lat, WEATHER_COORD_PRECISION), round(lon, WEATHER_COORD_PRECISION), units.lower())


def _is_weather_cache_fresh(cached_at: datetime, now: datetime) -> bool:
    age_seconds = (now - cached_at).total_seconds()
    return age_seconds < WEATHER_CACHE_TTL_SECONDS


async def _get_weather_lock(cache_key: Tuple[float, float, str]) -> asyncio.Lock:
    async with weather_cache_guard:
        lock = weather_cache_locks.get(cache_key)
        if lock is None:
            lock = asyncio.Lock()
            weather_cache_locks[cache_key] = lock
        return lock


def _build_weather_response(payload: Any, cached: bool) -> Any:
    """
    Return upstream weather payload with backend cache metadata.
    If payload is a dict (OpenWeather response), inject a top-level `cached` flag.
    """
    if isinstance(payload, dict):
        response_payload = dict(payload)
        response_payload["cached"] = cached
        return response_payload
    return payload

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

    cache_key = _normalize_weather_key(lat, lon, units)
    now = datetime.now(timezone.utc)

    # Fast path: return fresh cache without waiting for a lock.
    cached_entry = weather_cache.get(cache_key)
    if cached_entry and _is_weather_cache_fresh(cached_entry["cached_at"], now):
        logger.info("Weather cache HIT for key=%s", cache_key)
        return _build_weather_response(cached_entry["data"], cached=True)

    # Slow path: synchronize refreshes for this cache key.
    lock = await _get_weather_lock(cache_key)
    async with lock:
        now = datetime.now(timezone.utc)
        cached_entry = weather_cache.get(cache_key)
        if cached_entry and _is_weather_cache_fresh(cached_entry["cached_at"], now):
            logger.info("Weather cache HIT-after-lock for key=%s", cache_key)
            return _build_weather_response(cached_entry["data"], cached=True)

        logger.info("Weather cache MISS for key=%s; calling OpenWeather", cache_key)

        url = "https://api.openweathermap.org/data/4.0/onecall/current"
        params = {
            "lat": lat,
            "lon": lon,
            "appid": API_KEY,
            "units": units
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                payload = resp.json()

            weather_cache[cache_key] = {
                "cached_at": datetime.now(timezone.utc),
                "data": payload,
            }
            return _build_weather_response(payload, cached=False)
        except httpx.RequestError as exc:
            logger.error(f"An error occurred while requesting {exc.request.url!r}: {exc}")
            raise HTTPException(status_code=503, detail=f"Weather Service Unreachable: {exc}")
        except httpx.HTTPStatusError as exc:
            logger.error(f"Error response {exc.response.status_code} while requesting {exc.request.url!r}")
            raise HTTPException(status_code=exc.response.status_code, detail="Weather API Error")

class SQLQuery(BaseModel):
    query: str

@app.post("/api/query")
def execute_readonly_query(sql_query: SQLQuery, username: str = Depends(get_current_username)):
    """
    Executes a read-only SQL query against the database.
    """
    db_path = os.getenv("DB_PATH", "database.db")
    # Convert to URI
    # Use absolute path to ensure URI works correctly
    abs_path = os.path.abspath(db_path)
    # Create a read-only URI
    db_uri = Path(abs_path).as_uri() + "?mode=ro"

    try:
        # uri=True allows passing parameters like mode=ro
        with sqlite3.connect(db_uri, uri=True) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(sql_query.query)
            result = cursor.fetchall()
            return [dict(row) for row in result]
    except sqlite3.OperationalError as e:
        raise HTTPException(status_code=400, detail=f"Database error: {e}")
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# Mount static files
# Priority: ../frontend (Local dev), static/ (Docker)
if os.path.exists("../frontend"):
    static_dir = "../frontend"
elif os.path.exists("static"):
    static_dir = "static"
else:
    static_dir = None
    print("Warning: Static directory not found at ../frontend or static/")

if static_dir:
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
