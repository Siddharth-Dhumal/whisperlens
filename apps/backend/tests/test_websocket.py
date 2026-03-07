from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_live_websocket_accepts_text_message():
    with client.websocket_connect("/ws/live") as websocket:
        websocket.send_text("hello")
        response = websocket.receive_json()

        assert response["type"] == "text_ack"
        assert response["message"] == "hello"