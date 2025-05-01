from flask import Flask
from config.settings import *
def create_app():
    app = Flask(__name__)
    app.config.from_object('backend.config.settings')
    # TODO: register blueprints here
    return app
if __name__ == '__main__':
    create_app().run(host='0.0.0.0', port=5000)
