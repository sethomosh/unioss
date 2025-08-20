# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from app.main import app  # make sure this imports your FastAPI app object

@pytest.fixture(scope="session")
def client():
    return TestClient(app)
