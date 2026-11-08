"""RADAR v6 — Entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f'\n🎯 RADAR v6 Backend  →  http://localhost:{port}')
    print(f'   Endpoints: /api/health  /api/search  /api/report  /api/graph  /api/alerts\n')
    app.run(host='0.0.0.0', port=port, debug=True)
