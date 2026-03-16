class DomainError(Exception):
    """ドメイン例外の基底クラス"""


class NotFoundError(DomainError):
    def __init__(self, resource: str, identifier: str | int) -> None:
        super().__init__(f"{resource} が見つかりません: {identifier}")
        self.resource = resource
        self.identifier = identifier


class UnauthorizedError(DomainError):
    def __init__(self, message: str = "認証が必要です") -> None:
        super().__init__(message)


class ForbiddenError(DomainError):
    def __init__(self, message: str = "このリソースへのアクセス権限がありません") -> None:
        super().__init__(message)
