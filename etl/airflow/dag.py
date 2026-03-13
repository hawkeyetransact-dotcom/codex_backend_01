from __future__ import annotations

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime


def ingest_public_sources(**_context):
    print("Run public source crawlers and land Bronze artifacts")


def normalize_and_resolve(**_context):
    print("Normalize Bronze to Silver and run entity resolution")


def rebuild_search(**_context):
    print("Refresh Gold search index")


with DAG(
    dag_id="hawkeye_marketplace_catalog_v2",
    start_date=datetime(2026, 3, 12),
    schedule="@daily",
    catchup=False,
    tags=["hawkeye", "marketplace", "catalog-v2"],
) as dag:
    crawl = PythonOperator(task_id="crawl_sources", python_callable=ingest_public_sources)
    normalize = PythonOperator(task_id="normalize_and_resolve", python_callable=normalize_and_resolve)
    index = PythonOperator(task_id="rebuild_search", python_callable=rebuild_search)

    crawl >> normalize >> index
