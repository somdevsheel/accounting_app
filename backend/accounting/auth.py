"""Local password hashing + session tokens. No external auth dependency —
stdlib hashlib (PBKDF2-HMAC-SHA256) + secrets, works fully offline."""
import hashlib
import secrets

PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS).hex()
    return digest, salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS).hex()
    return secrets.compare_digest(digest, password_hash)


def new_token() -> str:
    return secrets.token_hex(32)
