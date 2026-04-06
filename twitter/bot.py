"""
AV Policy Watch - Twitter Bot
-------------------------------
Runs two jobs in a continuous loop:

1. CRASH SCANNER  - Scans Google News every CHECK_INTERVAL_HOURS for human-caused
                    car crash articles, generates a pointed pro-AV tweet, and posts it.

2. COUNTER TWEETS - Posts daily per-city "if they had launched on X date..." stats
                    and a weekly national summary. Skips if already posted today/this week.

Setup:
  pip install -r requirements.txt
  cp .env.example .env      # fill in your credentials
  python bot.py
"""

import os
import time
import random
import sqlite3
import feedparser
import tweepy
import anthropic
from datetime import datetime, date, timedelta
from dotenv import load_dotenv

load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY         = os.getenv('ANTHROPIC_API_KEY')
TWITTER_API_KEY           = os.getenv('TWITTER_API_KEY')
TWITTER_API_SECRET        = os.getenv('TWITTER_API_SECRET')
TWITTER_ACCESS_TOKEN      = os.getenv('TWITTER_ACCESS_TOKEN')
TWITTER_ACCESS_TOKEN_SECRET = os.getenv('TWITTER_ACCESS_TOKEN_SECRET')

CHECK_INTERVAL_HOURS = 2      # how often to scan for crash news
MAX_CRASH_TWEETS_PER_RUN = 2  # cap so the account doesn't spam

# ─── City data (mirrors js/data.js methodology) ───────────────────────────────
# effective_factor = ride_hail_vmt_share * waymo_market_share(0.22) * crash_reduction(0.85)

CITIES = [
    {
        'id': 'boston',
        'name': 'Boston',
        'state': 'MA',
        'delay_start': date(2023, 6, 1),   # testing began May 2025, but regulatory limbo since
        'effective_factor': 0.00935,        # 5% VMT * 22% * 85%
        'key_blocker': 'no regulatory framework despite 22+ months of testing',
        'injury_crash_per_fatality': 61,
        'serious_injury_per_fatality': 6,
        'pedestrian_injury_per_fatality': 3,
    },
    {
        'id': 'dc',
        'name': 'Washington DC',
        'state': 'DC',
        'delay_start': date(2024, 4, 1),
        'effective_factor': 0.01290,
        'key_blocker': 'B26-0323 stalled in DC Council since April 2024',
        'injury_crash_per_fatality': 61,
        'serious_injury_per_fatality': 6,
        'pedestrian_injury_per_fatality': 3,
    },
    {
        'id': 'nyc',
        'name': 'New York City',
        'state': 'NY',
        'delay_start': date(2025, 10, 1),
        'effective_factor': 0.01500,
        'key_blocker': 'A793/S2688 would ban AVs outright; mapping blocked',
        'injury_crash_per_fatality': 61,
        'serious_injury_per_fatality': 6,
        'pedestrian_injury_per_fatality': 3,
    },
    {
        'id': 'chicago',
        'name': 'Chicago',
        'state': 'IL',
        'delay_start': date(2024, 12, 1),
        'effective_factor': 0.01120,
        'key_blocker': 'AVs arrived with no regulatory framework in place',
        'injury_crash_per_fatality': 61,
        'serious_injury_per_fatality': 6,
        'pedestrian_injury_per_fatality': 3,
    },
    {
        'id': 'seattle',
        'name': 'Seattle',
        'state': 'WA',
        'delay_start': date(2024, 1, 1),
        'effective_factor': 0.01310,
        'key_blocker': 'state AV bills stalled, no commercial service framework',
        'injury_crash_per_fatality': 61,
        'serious_injury_per_fatality': 6,
        'pedestrian_injury_per_fatality': 3,
    },
]

# ─── News feeds ───────────────────────────────────────────────────────────────

CRASH_FEEDS = [
    'https://news.google.com/rss/search?q=car+crash+driver+killed&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=fatal+car+accident+speeding+drunk&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=pedestrian+killed+driver&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=distracted+driver+crash+death&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=drunk+driver+fatal+crash&hl=en-US&gl=US&ceid=US:en',
]

RELEVANCE_KEYWORDS = [
    'fatal', 'killed', 'died', 'death', 'fatality',
    'drunk driver', 'distracted', 'speeding', 'hit-and-run',
    'ran red light', 'wrong way', 'reckless',
]

EXCLUDE_KEYWORDS = [
    'autonomous', 'self-driving', 'waymo', 'tesla', 'robotaxi',
    'plane crash', 'train crash', 'boat',
]

# ─── Database ─────────────────────────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect('bot_state.db')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS tweeted_articles (
            url TEXT PRIMARY KEY,
            tweeted_at TEXT
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS counter_tweets (
            key TEXT PRIMARY KEY,
            tweeted_at TEXT
        )
    ''')
    conn.commit()
    return conn


def already_tweeted_article(conn, url):
    return conn.execute(
        'SELECT url FROM tweeted_articles WHERE url = ?', (url,)
    ).fetchone() is not None


def mark_article_tweeted(conn, url):
    conn.execute(
        'INSERT OR REPLACE INTO tweeted_articles VALUES (?, ?)',
        (url, datetime.now().isoformat())
    )
    conn.commit()


def already_posted_counter(conn, key):
    row = conn.execute(
        'SELECT tweeted_at FROM counter_tweets WHERE key = ?', (key,)
    ).fetchone()
    return row is not None


def mark_counter_posted(conn, key):
    conn.execute(
        'INSERT OR REPLACE INTO counter_tweets VALUES (?, ?)',
        (key, datetime.now().isoformat())
    )
    conn.commit()


# ─── Calculations ─────────────────────────────────────────────────────────────

SECONDS_PER_YEAR = 365.25 * 24 * 3600

def city_annual_fatalities(city):
    """Rough annual fatalities for city (used as baseline for rate calc)."""
    baselines = {
        'boston': 60, 'dc': 27, 'nyc': 230, 'chicago': 160, 'seattle': 45
    }
    return baselines.get(city['id'], 50)


def preventable_deaths(city, as_of=None):
    if as_of is None:
        as_of = date.today()
    delay_start = city['delay_start']
    if as_of <= delay_start:
        return 0.0
    years_elapsed = (as_of - delay_start).total_seconds() / SECONDS_PER_YEAR
    annual = city_annual_fatalities(city)
    return annual * city['effective_factor'] * years_elapsed


def harms(city, as_of=None):
    deaths = preventable_deaths(city, as_of)
    return {
        'deaths': deaths,
        'injury_crashes': deaths * city['injury_crash_per_fatality'],
        'serious_injuries': deaths * city['serious_injury_per_fatality'],
        'pedestrian_injuries': deaths * city['pedestrian_injury_per_fatality'],
    }


def national_totals(as_of=None):
    totals = {'deaths': 0.0, 'injury_crashes': 0.0, 'serious_injuries': 0.0, 'pedestrian_injuries': 0.0}
    for city in CITIES:
        h = harms(city, as_of)
        for k in totals:
            totals[k] += h[k]
    return totals


# ─── Tweet generators ──────────────────────────────────────────────────────────

def make_crash_tweet(client, article):
    prompt = f"""You run @AVPolicyWatch, a pro-autonomous vehicle policy account that makes the case for autonomous vehicle deployment.

You found this car crash news article:
Title: {article['title']}
Summary: {article['summary'][:600]}
URL: {article['url']}

Write a tweet (max 240 characters total including the URL) that:
- Acknowledges the tragedy with genuine empathy - a real person was hurt or killed
- Gently notes that autonomous vehicle technology could help prevent crashes like this
- Links to avpolicywatch.com or the article URL
- Tone: compassionate and factual, never mocking or blaming the victim or driver
- Do NOT say things like "humans are bad drivers" or anything that blames the person
- Frame it as a systemic issue - we have technology that could save lives and it's being blocked
- No hashtags, no exclamation points, no emojis

Example tone: "Another preventable tragedy. Crashes like this are exactly why we track the cost of stalling AV deployment. [url]"

Return ONLY the tweet text. Nothing else."""

    msg = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=150,
        messages=[{'role': 'user', 'content': prompt}]
    )
    return msg.content[0].text.strip()


def make_city_counter_tweet(city):
    h = harms(city)
    d = h['deaths']
    ic = h['injury_crashes']
    si = h['serious_injuries']
    month_year = city['delay_start'].strftime('%B %Y')

    return (
        f"If {city['name']} had launched AVs in {month_year}, an estimated "
        f"{d:.1f} lives could have been saved by now - plus ~{ic:.0f} injury crashes "
        f"and ~{si:.0f} serious injuries prevented. "
        f"Instead: {city['key_blocker']}. avpolicywatch.com"
    )


def make_weekly_national_tweet():
    t = national_totals()
    return (
        f"Across 5 US cities blocking AV deployment, an estimated "
        f"{t['deaths']:.1f} preventable deaths have accumulated since delays began. "
        f"Plus ~{t['injury_crashes']:.0f} injury crashes and ~{t['serious_injuries']:.0f} "
        f"serious injuries that didn't have to happen. avpolicywatch.com"
    )


# ─── Jobs ─────────────────────────────────────────────────────────────────────

def job_crash_scanner(conn, anthropic_client, twitter_client):
    print(f"  [crash scanner] fetching feeds...")
    articles = []
    for feed_url in CRASH_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:8]:
                articles.append({
                    'title': entry.get('title', ''),
                    'url':   entry.get('link', ''),
                    'summary': entry.get('summary', ''),
                })
        except Exception as e:
            print(f"  [crash scanner] feed error: {e}")

    # Filter
    def is_relevant(a):
        text = (a['title'] + ' ' + a['summary']).lower()
        has_keyword = any(kw in text for kw in RELEVANCE_KEYWORDS)
        is_excluded = any(kw in text for kw in EXCLUDE_KEYWORDS)
        return has_keyword and not is_excluded and a['url']

    new = [a for a in articles if is_relevant(a) and not already_tweeted_article(conn, a['url'])]
    print(f"  [crash scanner] {len(new)} new relevant articles")

    posted = 0
    for article in new[:MAX_CRASH_TWEETS_PER_RUN]:
        try:
            tweet = make_crash_tweet(anthropic_client, article)
            if len(tweet) > 280:
                tweet = tweet[:277] + '...'
            print(f"  [crash scanner] posting: {tweet[:80]}...")
            twitter_client.create_tweet(text=tweet)
            mark_article_tweeted(conn, article['url'])
            posted += 1
            # Random delay between 20 and 90 minutes so posts feel organic
            if posted < MAX_CRASH_TWEETS_PER_RUN:
                delay_minutes = random.randint(20, 90)
                print(f"  [crash scanner] waiting {delay_minutes} min before next post...")
                time.sleep(delay_minutes * 60)
        except Exception as e:
            print(f"  [crash scanner] post error: {e}")

    print(f"  [crash scanner] posted {posted} tweets")


def job_counter_tweets(conn, twitter_client):
    today = date.today()

    # Daily: rotate through cities - one city per day
    day_index = today.toordinal() % len(CITIES)
    city = CITIES[day_index]
    daily_key = f"daily_{today.isoformat()}"

    if not already_posted_counter(conn, daily_key):
        try:
            tweet = make_city_counter_tweet(city)
            if len(tweet) > 280:
                tweet = tweet[:277] + '...'
            print(f"  [counter] daily tweet for {city['name']}: {tweet[:80]}...")
            twitter_client.create_tweet(text=tweet)
            mark_counter_posted(conn, daily_key)
            time.sleep(15)
        except Exception as e:
            print(f"  [counter] daily tweet error: {e}")
    else:
        print(f"  [counter] daily tweet already posted today")

    # Weekly: every Monday
    if today.weekday() == 0:
        weekly_key = f"weekly_{today.isocalendar()[1]}_{today.year}"
        if not already_posted_counter(conn, weekly_key):
            try:
                tweet = make_weekly_national_tweet()
                if len(tweet) > 280:
                    tweet = tweet[:277] + '...'
                print(f"  [counter] weekly national: {tweet[:80]}...")
                twitter_client.create_tweet(text=tweet)
                mark_counter_posted(conn, weekly_key)
            except Exception as e:
                print(f"  [counter] weekly tweet error: {e}")
        else:
            print(f"  [counter] weekly tweet already posted this week")


# ─── Main loop ────────────────────────────────────────────────────────────────

def main():
    print("AV Policy Watch Bot starting...")

    # Validate env
    missing = [k for k in [
        'ANTHROPIC_API_KEY', 'TWITTER_API_KEY', 'TWITTER_API_SECRET',
        'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET'
    ] if not os.getenv(k)]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in your credentials.")
        return

    conn = init_db()
    anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    twitter_client = tweepy.Client(
        consumer_key=TWITTER_API_KEY,
        consumer_secret=TWITTER_API_SECRET,
        access_token=TWITTER_ACCESS_TOKEN,
        access_token_secret=TWITTER_ACCESS_TOKEN_SECRET,
    )

    print(f"Running. Crash scan every {CHECK_INTERVAL_HOURS}h, counter tweets daily.\n")

    while True:
        now = datetime.now()
        print(f"[{now.strftime('%Y-%m-%d %H:%M')}] Running jobs...")

        job_counter_tweets(conn, twitter_client)
        job_crash_scanner(conn, anthropic_client, twitter_client)

        print(f"  Done. Next run in {CHECK_INTERVAL_HOURS} hours.\n")
        time.sleep(CHECK_INTERVAL_HOURS * 3600)


if __name__ == '__main__':
    main()
