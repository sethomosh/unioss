# backend/snmp_routes.py

from flask import Blueprint, request, jsonify
from backend.utils.snmp_client import snmp_get

snmp_bp = Blueprint('snmp', __name__, url_prefix='/snmp')

# OIDs for sysDescr and sysObjectID
SYS_DESCR_OID     = "1.3.6.1.2.1.1.1.0"
SYS_OBJECT_ID_OID = "1.3.6.1.2.1.1.2.0"

@snmp_bp.route('/sysdescr')
def sysdescr():
    host      = request.args.get('host')
    community = request.args.get('community', 'public')
    port      = request.args.get('port', type=int) or 161

    if not host:
        return jsonify({'error': 'Missing host parameter'}), 400
    try:
        result = snmp_get(host, community, SYS_DESCR_OID, port)
        return jsonify({'sysdescr': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 502

@snmp_bp.route('/sysobjectid')
def sysobjectid():
    host      = request.args.get('host')
    community = request.args.get('community', 'public')
    port      = request.args.get('port', type=int) or 161

    if not host:
        return jsonify({'error': 'Missing host parameter'}), 400
    try:
        result = snmp_get(host, community, SYS_OBJECT_ID_OID, port)
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
    port      = request.args.get('port', type=int) or 161

    if not host or not oid:
        return jsonify({'error': 'Missing host or oid parameter'}), 400

    try:
        value = snmp_get(host, community, oid, port)
        return jsonify({'oid': oid, 'value': value}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 502
