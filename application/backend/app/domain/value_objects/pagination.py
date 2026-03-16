from dataclasses import dataclass

_MAX_PER_PAGE = 100


@dataclass(frozen=True)
class Pagination:
    page: int
    per_page: int
    total: int

    def __post_init__(self) -> None:
        if self.page < 1:
            raise ValueError(f"page は 1 以上で指定してください: {self.page}")
        if not (1 <= self.per_page <= _MAX_PER_PAGE):
            raise ValueError(
                f"per_page は 1〜{_MAX_PER_PAGE} の範囲で指定してください: {self.per_page}"
            )

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.per_page

    @property
    def total_pages(self) -> int:
        return (self.total + self.per_page - 1) // self.per_page

    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages
