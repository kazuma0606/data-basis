from enum import Enum


class SegmentLabel(str, Enum):
    ACTIVE = "active"
    DORMANT = "dormant"
    CHURNED = "churned"
