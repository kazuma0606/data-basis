import pytest

from app.domain.value_objects.role import Role


@pytest.mark.parametrize("role", [Role.ADMIN, Role.ENGINEER])
def test_ops_accessible_roles(role: Role) -> None:
    assert role.can_access_ops() is True


@pytest.mark.parametrize("role", [Role.MARKETER, Role.STORE_MANAGER])
def test_ops_inaccessible_roles(role: Role) -> None:
    assert role.can_access_ops() is False


@pytest.mark.parametrize("role", [Role.ADMIN, Role.MARKETER, Role.STORE_MANAGER])
def test_business_accessible_roles(role: Role) -> None:
    assert role.can_access_business() is True


def test_engineer_cannot_access_business() -> None:
    assert Role.ENGINEER.can_access_business() is False


def test_store_manager_is_store_scoped() -> None:
    assert Role.STORE_MANAGER.is_store_scoped() is True


@pytest.mark.parametrize("role", [Role.ADMIN, Role.ENGINEER, Role.MARKETER])
def test_non_store_manager_is_not_store_scoped(role: Role) -> None:
    assert role.is_store_scoped() is False


def test_role_is_string_enum() -> None:
    assert Role.ADMIN == "admin"
    assert Role.STORE_MANAGER == "store_manager"
