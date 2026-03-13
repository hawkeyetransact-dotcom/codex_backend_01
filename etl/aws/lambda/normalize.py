from __future__ import annotations


def handler(event, _context):
    return {"status": "ok", "stage": "normalize", "input": event}
