import unittest
from tempfile import TemporaryDirectory
from urllib3.response import HTTPResponse

from requests import Request, Response
from requests_cache import CachedSession
from requests_compat import repair_requests_type_hints


class RequestsCompatibilityTests(unittest.TestCase):
    def test_cache_round_trip_preserves_response_and_cookies(self):
        repair_requests_type_hints()
        repair_requests_type_hints()  # Safe when several importers share a process.
        response = Response()
        response.status_code = 200
        response.url = "https://example.com/schedule"
        response._content = b'{"round": 18}'
        response.raw = HTTPResponse(body=response._content)
        response.request = Request("GET", response.url).prepare()
        response.cookies.set("session", "test")
        with TemporaryDirectory() as directory:
            with CachedSession(cache_name=directory + "/cache", backend="sqlite") as session:
                session.cache.save_response(response)
                restored = session.cache.get_response(session.cache.create_key(response.request))
                self.assertEqual(restored.json(), {"round": 18})
                self.assertEqual(restored.cookies["session"], "test")


if __name__ == "__main__":
    unittest.main()
