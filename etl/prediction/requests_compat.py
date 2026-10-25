"""Keep Requests 2.34 annotations usable by FastF1's cache serializer."""
import typing

import requests.models
from http.cookiejar import CookieJar
from requests.adapters import HTTPAdapter
from requests.cookies import RequestsCookieJar


def repair_requests_type_hints():
    # Requests imports these only under TYPE_CHECKING; attrs/cattrs evaluate the
    # annotations at runtime when serializing a CachedResponse or CachedRequest.
    # https://github.com/psf/requests/issues/7456
    try:
        for model in (requests.models.Response, requests.models.PreparedRequest,
                      requests.models.Request):
            typing.get_type_hints(model)
    except NameError:
        for name, value in (("RequestsCookieJar", RequestsCookieJar),
                            ("CookieJar", CookieJar), ("HTTPAdapter", HTTPAdapter)):
            requests.models.__dict__.setdefault(name, value)
