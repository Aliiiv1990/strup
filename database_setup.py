import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from database_models import Base # Assuming database_models.py is in the same directory or accessible

# Default SQLite database URL for local development
DEFAULT_SQLITE_DB_URL = "sqlite:///./whatsapp_scheduler.db"

# Global session manager
SessionLocal = None
engine = None

def init_db(database_url: str = None):
    """
    Initializes the database engine and creates all tables if they don't exist.

    Args:
        database_url (str, optional): The database connection string.
            If None, uses the SQLALCHEMY_DATABASE_URL environment variable
            or falls back to a default SQLite database (whatsapp_scheduler.db).
    """
    global engine, SessionLocal

    if database_url:
        current_engine_url = database_url
    else:
        current_engine_url = os.environ.get("SQLALCHEMY_DATABASE_URL", DEFAULT_SQLITE_DB_URL)

    print(f"Initializing database with URL: {current_engine_url}")

    engine = create_engine(current_engine_url) # Add connect_args for SQLite if needed e.g. {"check_same_thread": False} for SQLite

    # Create all tables in the engine. This is equivalent to "Create Table If Not Exists"
    # It will not recreate tables if they already exist.
    Base.metadata.create_all(bind=engine)

    # SessionLocal will be a factory for new Session objects
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    print("Database tables created successfully (if they didn't exist).")
    return engine

def get_db_session():
    """
    Provides a database session.
    It's the responsibility of the caller to close the session.
    e.g.
    db = get_db_session()
    try:
        # do stuff
    finally:
        db.close()
    """
    if not SessionLocal:
        raise Exception("Database not initialized. Call init_db() first.")
    return SessionLocal()

if __name__ == "__main__":
    # Example usage:
    # 1. Initialize with default SQLite DB
    init_db()
    print(f"Engine created: {engine}")
    print(f"SessionLocal created: {SessionLocal}")

    # 2. To use a different database (e.g., PostgreSQL from environment variable):
    # os.environ["SQLALCHEMY_DATABASE_URL"] = "postgresql://user:password@host:port/dbname"
    # init_db() 
    # print(f"Engine created for PostgreSQL: {engine}")

    # Example of getting a session
    db = get_db_session()
    print(f"Obtained session: {db}")
    # Remember to close the session when done
    db.close()
    print("Session closed.")
