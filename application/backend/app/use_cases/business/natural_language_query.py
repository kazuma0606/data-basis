from app.interfaces.clients.llm_client import ILLMClient

_SCHEMA_CONTEXT = """
利用可能なテーブル:
- unified_customers(unified_id, name_kanji, email, phone, birth_date, prefecture)
- churn_labels(unified_id, label[active/dormant/churned], days_since_purchase)
- customer_scores(unified_id, category_id, affinity_score, churn_risk_score)
- sales_by_channel(date, channel[ec/store], store_id, category_id, total_amount, order_count)
- churn_summary_weekly(week, label, customer_count, avg_days_since_purchase)
- category_affinity_summary(week, category_id, age_group, gender, avg_score, customer_count)
""".strip()


class NaturalLanguageQueryUseCase:
    def __init__(self, llm: ILLMClient) -> None:
        self._llm = llm

    async def execute(self, query: str) -> str:
        prompt = (
            f"あなたはテクノマートのデータ基盤アナリストです。\n"
            f"以下のスキーマ情報を参考に、ユーザーの質問に日本語で回答してください。\n\n"
            f"スキーマ:\n{_SCHEMA_CONTEXT}\n\n"
            f"質問: {query}\n\n"
            f"回答:"
        )
        return await self._llm.generate(prompt)
