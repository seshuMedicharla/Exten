
from urllib.parse import urlsplit
from ipaddress import ip_address
import pandas as pd
import re

KEYWORDS = (
    "login", "verify", "account", "update",
    "secure", "password", "signin", "bank"
)


def extract_features(url):
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    path = parts.path.lower()
    query = parts.query.lower()
    full = url.lower()

    try:
        ip_address(host)
        is_ip = 1
    except ValueError:
        is_ip = 0

    return {
        "url_length": len(url),
        "host_length": len(host),
        "path_length": len(path),
        "query_length": len(query),
        "dot_count": host.count("."),
        "hyphen_count": host.count("-"),
        "digit_count": sum(c.isdigit() for c in full),
        "special_char_count": len(
            re.findall(r"[@?=&%_]", url)
        ),
        "subdomain_count": max(0, host.count(".") - 1),
        "has_ip": is_ip,
        "uses_https": int(parts.scheme == "https"),
        "has_at_symbol": int("@" in url),
        "has_punycode": int("xn--" in host),
        "has_suspicious_keyword": int(
            any(word in full for word in KEYWORDS)
        ),
        "has_encoded_chars": int("%" in url),
    }


def build_features(urls):
    return pd.DataFrame(
        [extract_features(url) for url in urls]
    )
