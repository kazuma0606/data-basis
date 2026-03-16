from dataclasses import dataclass


@dataclass(frozen=True)
class ScoreRange:
    """0〜100 の範囲に制約されたスコア値オブジェクト"""

    value: float

    def __post_init__(self) -> None:
        if not (0.0 <= self.value <= 100.0):
            raise ValueError(f"スコアは 0〜100 の範囲で指定してください: {self.value}")

    def __float__(self) -> float:
        return self.value
