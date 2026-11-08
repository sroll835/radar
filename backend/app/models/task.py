"""RADAR v6 — TaskManager (patrón MiroFish)"""
import uuid, threading
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional

class TaskStatus(str, Enum):
    PENDING    = 'pending'
    PROCESSING = 'processing'
    COMPLETED  = 'completed'
    FAILED     = 'failed'

class Task:
    def __init__(self, task_id, task_type, metadata):
        self.task_id    = task_id
        self.task_type  = task_type
        self.metadata   = metadata
        self.status     = TaskStatus.PENDING
        self.progress   = 0
        self.message    = 'En cola'
        self.result     = None
        self.error      = None
        self.created_at = datetime.now().isoformat()
        self.updated_at = self.created_at

    def to_dict(self):
        return dict(task_id=self.task_id, task_type=self.task_type,
                    status=self.status, progress=self.progress,
                    message=self.message, result=self.result,
                    error=self.error, created_at=self.created_at,
                    updated_at=self.updated_at)

class TaskManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._tasks: Dict[str, Task] = {}
        return cls._instance

    def create_task(self, task_type, metadata={}):
        tid = str(uuid.uuid4())
        self._tasks[tid] = Task(tid, task_type, metadata)
        return tid

    def get_task(self, task_id):
        return self._tasks.get(task_id)

    def update_task(self, task_id, status=None, progress=None,
                    message=None, result=None, error=None):
        t = self._tasks.get(task_id)
        if not t: return
        if status   is not None: t.status   = status
        if progress is not None: t.progress = progress
        if message  is not None: t.message  = message
        if result   is not None: t.result   = result
        if error    is not None: t.error    = error
        t.updated_at = datetime.now().isoformat()
