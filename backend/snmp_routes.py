# backend/snmp_routes.py

from flask import Blueprint, request, jsonify
from backend.utils.snmp_client import snmp_sysdescr, snmp_sysobjectid

snmp_bp = Blueprint('snmp', __name__, url_prefix='/snmp')

@snmp_bp.route('/sysdescr')
def sysdescr():
    host = request.args.get('host')
    if not host:
        return jsonify({'error': 'Missing host parameter'}), 400
    try:
        result = snmp_sysdescr(host)
        return jsonify({'sysDescr': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@snmp_bp.route('/sysobjectid')
def sysobjectid():
    host = request.args.get('host')
    if not host:
        return jsonify({'error': 'Missing host parameter'}), 400
    try:
        result = snmp_sysobjectid(host)
        return jsonify({'sysObjectID': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
