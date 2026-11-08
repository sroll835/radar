"""RADAR v6 — Logger"""
import logging, sys
_loggers = {}
def setup_logger(name, level=logging.INFO):
    logger = logging.getLogger(name)
    if not logger.handlers:
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter('%(asctime)s [%(name)s] %(levelname)s — %(message)s', datefmt='%H:%M:%S'))
        logger.addHandler(h)
    logger.setLevel(level)
    _loggers[name] = logger
    return logger
def get_logger(name):
    return _loggers.get(name) or setup_logger(name)
