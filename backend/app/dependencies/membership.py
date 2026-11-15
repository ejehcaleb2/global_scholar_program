from datetime import datetime, timezone
from typing import Literal

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_optional_user
from app.models.gsp_models import Subscription, SubscriptionStatus, User


def active_subscription_criteria(user_id, now: datetime):
    return (
        Subscription.user_id == user_id,
        Subscription.status == SubscriptionStatus.active,
        Subscription.current_period_end.is_not(None),
        Subscription.current_period_end > now,
    )


async def get_membership_tier(
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> Literal['free', 'paid']:
    if current_user is None:
        return 'free'

    now = datetime.now(timezone.utc)
    active_subscription = await db.scalar(
        select(Subscription.id)
        .where(*active_subscription_criteria(current_user.id, now))
        .limit(1)
    )
    return 'paid' if active_subscription is not None else 'free'
