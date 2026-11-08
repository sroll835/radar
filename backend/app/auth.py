"""RADAR v7 — Auth JWT + rate limiting simple (sin dependencias extra salvo PyJWT)."""
import os, time, hmac, functools
import jwt
from flask import request, jsonify

SECRET = lambda: os.environ.get('SECRET_KEY', 'radar-secret-2025')
_hits = {}

def _users():
    # Usuarios desde .env: ADMIN_USER / ADMIN_PASSWORD (+ ANALYST_USER / ANALYST_PASSWORD)
    u = {}
    if os.environ.get('ADMIN_PASSWORD'): u[os.environ.get('ADMIN_USER', 'admin')] = (os.environ['ADMIN_PASSWORD'], 'admin')
    if os.environ.get('ANALYST_PASSWORD'): u[os.environ.get('ANALYST_USER', 'analista')] = (os.environ['ANALYST_PASSWORD'], 'analyst')
    return u

def make_token(user, role, hours=8):
    return jwt.encode({'sub': user, 'role': role, 'exp': int(time.time()) + hours * 3600}, SECRET(), algorithm='HS256')

def current_user():
    h = request.headers.get('Authorization', '')
    if not h.startswith('Bearer '): return None
    try: return jwt.decode(h[7:], SECRET(), algorithms=['HS256'])
    except jwt.PyJWTError: return None

def auth_required():
    return os.environ.get('REQUIRE_AUTH', 'false').lower() == 'true'

def register(app):
    @app.before_request
    def _guard():
        p = request.path
        if not p.startswith('/api/') or request.method == 'OPTIONS': return
        ip = request.remote_addr or '?'
        now = time.time(); w = [t for t in _hits.get(ip, []) if now - t < 60]; w.append(now); _hits[ip] = w
        if len(w) > int(os.environ.get('RATE_LIMIT_PER_MIN', '120')):
            return jsonify({'success': False, 'error': 'Demasiadas solicitudes'}), 429
        if auth_required() and p not in ('/api/health', '/api/auth/login', '/api/auth/me') and not current_user():
            return jsonify({'success': False, 'error': 'No autenticado'}), 401

    @app.post('/api/auth/login')
    def login():
        b = request.get_json(force=True) or {}
        us = _users()
        if not us: return jsonify({'success': False, 'error': 'Sin usuarios: define ADMIN_PASSWORD en .env'}), 503
        rec = us.get(b.get('user', ''))
        if not rec or not hmac.compare_digest(rec[0], str(b.get('password', ''))):
            time.sleep(0.5); return jsonify({'success': False, 'error': 'Credenciales inválidas'}), 401
        return jsonify({'success': True, 'token': make_token(b['user'], rec[1]), 'role': rec[1], 'user': b['user']})

    @app.get('/api/auth/me')
    def me():
        u = current_user()
        return jsonify({'success': bool(u), 'user': u, 'auth_required': auth_required()})
