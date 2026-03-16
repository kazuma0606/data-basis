import pytest

from app.domain.value_objects.score import ScoreRange


@pytest.mark.parametrize("value", [0.0, 1.0, 50.0, 99.9, 100.0])
def test_valid_score(value: float) -> None:
    s = ScoreRange(value)
    assert float(s) == value


@pytest.mark.parametrize("value", [-0.1, -1.0, 100.1, 200.0])
def test_out_of_range_raises(value: float) -> None:
    with pytest.raises(ValueError, match="0〜100"):
        ScoreRange(value)


def test_score_is_immutable() -> None:
    s = ScoreRange(50.0)
    with pytest.raises(Exception):
        s.value = 60.0  # type: ignore[misc]  # frozen dataclass
