from app.domain.entities.user import AuthUser


class GetMeUseCase:
    def execute(self, current_user: AuthUser) -> AuthUser:
        return current_user
