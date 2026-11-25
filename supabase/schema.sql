-- Azzurro Hotels Booking.com Review Insights — PostgreSQL / Supabase Schema
-- Run this in Supabase SQL Editor to enable persistent live storage.

create extension if not exists "pgcrypto";

-- 1. Canonical Azzurro Hotels Sydney properties
create table if not exists public.properties (
  id text primary key,
  name text not null,
  short_name text not null,
  booking_slug text unique not null,
  booking_url text not null,
  address text not null,
  property_type text not null check (property_type in ('pod_hotel', 'boutique_pub_hotel')),
  has_free_dinner boolean not null default true,
  dinner_window text,
  booking_score numeric(3,1) not null,
  total_booking_reviews integer not null,
  wifi_score numeric(3,1) not null,
  updated_at timestamptz not null default now()
);

-- 2. Deduplicated Booking.com guest reviews + AI ops enrichment
create table if not exists public.reviews (
  id text primary key,
  property_id text not null references public.properties(id) on delete cascade,
  external_review_id text not null,
  reviewer_name text not null,
  reviewer_country text not null,
  traveler_type text not null,
  room_type text not null,
  stay_nights integer not null default 1,
  review_date date not null,
  score numeric(3,1) not null check (score >= 1.0 and score <= 10.0),
  title text not null,
  positive_text text,
  negative_text text,
  sentiment text not null check (sentiment in ('positive', 'neutral', 'negative')),
  aspects text[] not null default '{}',
  severity text not null check (severity in ('P1', 'P2', 'praise')),
  department text not null,
  ops_summary text not null,
  recommended_action text not null,
  draft_reply text not null,
  source_mode text not null default 'live_scrape',
  ingested_at timestamptz not null default now(),
  unique (property_id, external_review_id)
);

-- 3. Ingestion & enrichment audit log
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  provider text not null,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  reviews_fetched integer not null default 0,
  reviews_upserted integer not null default 0,
  notes text
);

-- Performance indexes for dashboard filtering
create index if not exists idx_reviews_property_date on public.reviews (property_id, review_date desc);
create index if not exists idx_reviews_severity on public.reviews (severity);
create index if not exists idx_reviews_sentiment on public.reviews (sentiment);
create index if not exists idx_reviews_aspects on public.reviews using gin (aspects);

-- Seed the four Sydney properties
insert into public.properties (
  id, name, short_name, booking_slug, booking_url, address, property_type,
  has_free_dinner, dinner_window, booking_score, total_booking_reviews, wifi_score
) values
  (
    'darling-harbour',
    'Azzurro Pod Hotel Darling Harbour - Near Convention Center',
    'Darling Harbour',
    'chateau-de-venus',
    'https://www.booking.com/hotel/au/chateau-de-venus.html',
    '22 Allen Street, Pyrmont NSW 2009',
    'pod_hotel',
    true,
    '6:30 PM – 7:45 PM',
    6.6,
    4310,
    8.3
  ),
  (
    'central-sydney',
    'Azzurro Pod Hotel Central Sydney - Near Central Station',
    'Central Sydney',
    'venus-surry-hills',
    'https://www.booking.com/hotel/au/venus-surry-hills.html',
    '90 Wentworth Avenue, Surry Hills NSW 2010',
    'pod_hotel',
    true,
    '7:00 PM – 8:00 PM',
    6.6,
    2450,
    9.0
  ),
  (
    'potts-point',
    'Azzurro Pod Hotel Potts Point - Near Kings Cross Station',
    'Potts Point',
    'venus-potts-point-sydney',
    'https://www.booking.com/hotel/au/venus-potts-point-sydney.html',
    '141–143 Victoria Street, Potts Point NSW 2011',
    'pod_hotel',
    true,
    '7:00 PM – 8:00 PM',
    6.3,
    2405,
    8.3
  ),
  (
    'olympic-paddington',
    'Olympic Paddington Budget Hotel - across Allianz Stadium',
    'Olympic Paddington',
    'olympic-paddington',
    'https://www.booking.com/hotel/au/olympic-paddington.html',
    '308 Moore Park Road, Paddington NSW 2021',
    'boutique_pub_hotel',
    false,
    null,
    6.5,
    125,
    8.3
  )
on conflict (id) do update set
  booking_score = excluded.booking_score,
  total_booking_reviews = excluded.total_booking_reviews,
  wifi_score = excluded.wifi_score,
  updated_at = now();
