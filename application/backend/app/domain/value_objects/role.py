from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    ENGINEER = "engineer"
    MARKETER = "marketer"
    STORE_MANAGER = "store_manager"

    def can_access_ops(self) -> bool:
        return self in (Role.ADMIN, Role.ENGINEER)

    def can_access_business(self) -> bool:
        return self in (Role.ADMIN, Role.MARKETER, Role.STORE_MANAGER)

    def is_store_scoped(self) -> bool:
        """store_manager は自店舗データのみアクセス可"""
        return self == Role.STORE_MANAGER
