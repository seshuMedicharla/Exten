"""Validate URL-only inputs without making network requests."""

from dataclasses import dataclass
from ipaddress import ip_address
import re
from urllib.parse import SplitResult, urlsplit

MAX_URL_LENGTH = 4096
_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", re.ASCII)


class InvalidPredictionUrl(ValueError):
    """The submitted address is unsupported or unsafe to process."""


@dataclass(frozen=True)
class ValidatedUrl:
    value: str
    parts: SplitResult
    hostname: str
    is_ip: bool


def validate_prediction_url(value: str) -> ValidatedUrl:
    if not isinstance(value, str) or not value or len(value) > MAX_URL_LENGTH:
        raise InvalidPredictionUrl
    if any(char.isspace() or ord(char) == 127 for char in value):
        raise InvalidPredictionUrl
    try:
        parts = urlsplit(value)
        hostname = parts.hostname
        port = parts.port  # Accessing this rejects malformed ports.
    except ValueError as exc:
        raise InvalidPredictionUrl from exc
    if parts.scheme not in ("http", "https") or not hostname or not parts.netloc:
        raise InvalidPredictionUrl
    if "@" in parts.netloc or parts.username is not None or parts.password is not None:
        raise InvalidPredictionUrl
    # Query strings and fragments can contain tokens or passwords. The extension strips them.
    if "?" in value or "#" in value or parts.query or parts.fragment:
        raise InvalidPredictionUrl
    if port is not None and not (1 <= port <= 65535):
        raise InvalidPredictionUrl
    try:
        ip_address(hostname)
        is_ip = True
    except ValueError:
        is_ip = False
        try:
            ascii_host = hostname.encode("idna").decode("ascii").lower()
        except UnicodeError as exc:
            raise InvalidPredictionUrl from exc
        if len(ascii_host) > 253 or ascii_host.endswith(".") or not all(
            _LABEL.fullmatch(label) for label in ascii_host.split(".")
        ):
            raise InvalidPredictionUrl
        if "." not in ascii_host and ascii_host != "localhost":
            raise InvalidPredictionUrl
    return ValidatedUrl(value=value, parts=parts, hostname=hostname.lower(), is_ip=is_ip)


def url_observations(url: ValidatedUrl) -> list[dict[str, str]]:
    observations = []
    if url.parts.scheme == "http":
        observations.append({"id": "http", "title": "HTTP URL", "detail": "The address does not request HTTPS encryption."})
    else:
        observations.append({"id": "https", "title": "HTTPS URL", "detail": "HTTPS in the address does not verify the website."})
    if url.is_ip:
        observations.append({"id": "ip-address", "title": "IP hostname", "detail": "The address uses an IP instead of a domain name."})
    if "xn--" in url.hostname:
        observations.append({"id": "punycode", "title": "Encoded hostname", "detail": "The hostname contains a Punycode label."})
    if url.parts.port is not None and url.parts.port != (80 if url.parts.scheme == "http" else 443):
        observations.append({"id": "custom-port", "title": "Nondefault port", "detail": "The address specifies a nondefault port."})
    return observations
