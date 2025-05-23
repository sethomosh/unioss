# backend/snmp_routes.py

from flask import Blueprint, request, jsonify
from backend.utils.snmp_client import snmp_sysdescr, snmp_sysobjectid

snmp_bp = Blueprint('snmp', __name__, url_prefix='/snmp')

@snmp_bp.route('/sysdescr')
def sysdescr():
    host      = request.args.get('host')
    community = request.args.get('community', 'public')
    port      = request.args.get('port', type=int)

    if not host:
        return jsonify({'error': 'Missing host parameter'}), 400
    try:
        result = snmp_sysdescr(host, community=community, port=port)
        return jsonify({'sysdescr': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 502

@snmp_bp.route('/sysobjectid')
def sysobjectid():
    host = request.args.get('host')
    community = request.args.get('community', 'public')
    port      = request.args.get('port', type=int)
    if not host:
        return jsonify({'error': 'Missing host parameter'}), 400
    try:
        result = snmp_sysobjectid(host, community=community, port=port)
        return jsonify({'sysobjectid': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 502


@snmp_bp.route('/get')
def get_oid():
    """
    Generic SNMP GET: ?host=…&oid=…[&community=…][&port=…]
    """
    host      = request.args.get('host')
    oid       = request.args.get('oid')
    community = request.args.get('community', 'public')
    port      = request.args.get('port', type=int)

    if not host or not oid:
        return jsonify({'error': 'Missing host or oid parameter'}), 400

    try:
        # snmp_get is the low-level fetcher in snmp_client.py
        from backend.utils.snmp_client import snmp_get
        result = snmp_get(host, community, oid, port)
        return jsonify({'oid': oid, 'value': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 502

def snmp_get_generic():
    host      = request.args.get('host', type=str)
    oid       = request.args.get('oid', type=str)
    community = request.args.get('community', 'public')
    port      = request.args.get('port', type=int)

    # Validate required params
    if not host:
        return jsonify({'error': 'Missing host parameter'}), 400
    if not oid:
        return jsonify({'error': 'Missing oid parameter'}), 400

    # Validate port if provided
    if port is not None and not (1 <= port <= 65535):
        return jsonify({'error': 'Port must be between 1 and 65535'}), 400

    # Quick OID sanity check: only digits and dots
    if not all(c.isdigit() or c == '.' for c in oid):
        return jsonify({'error': 'Invalid OID format'}), 400

    try:
        # delegate to your existing client, which already accepts port
        value = snmp_get(host, community, oid, port=port)
        return jsonify({'oid': oid, 'value': value}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 502