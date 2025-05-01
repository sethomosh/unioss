import os

MYSQL_HOST = os.getenv('MYSQL_HOST', 'db')
MYSQL_USER = os.getenv('MYSQL_USER', 'unios_user')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'StrongP@ssw0rd')
MYSQL_DB = os.getenv('MYSQL_DB', 'unios')

SNMP_USER = os.getenv('SNMP_USER', 'snmpuser')
SNMP_AUTH = os.getenv('SNMP_AUTH', 'authpass')
SNMP_PRIV = os.getenv('SNMP_PRIV', 'privpass')
