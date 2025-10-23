# Data Quality Standards

Ensuring data meets quality requirements before ML training.

---

## Data Quality Dimensions

### 1. Completeness

**Definition**: All required fields are present

**Check**:
```python
def check_completeness(df, required_fields):
    missing = [col for col in required_fields if col not in df.columns]

    if missing:
        raise DataQualityError(f"Missing required fields: {missing}")

    # Check for null values
    null_counts = df.select([
        pl.col(col).is_null().sum().alias(f"{col}_nulls")
        for col in required_fields
    ])

    threshold = 0.05  # 5% max missing
    for col in required_fields:
        null_pct = null_counts[f"{col}_nulls"][0] / len(df)
        if null_pct > threshold:
            raise DataQualityError(
                f"{col}: {null_pct:.1%} missing (threshold: {threshold:.1%})"
            )
```

**Required Fields** (MMM training):
- `date`: Date of observation
- `roas`: Return on ad spend (target variable)
- `ad_spend_google`: Google Ads spend
- `ad_spend_meta`: Meta Ads spend
- `temperature`: Temperature (°C)
- `location`: Geographic location

**Threshold**: <5% missing values per field

---

### 2. Validity

**Definition**: Values are within expected ranges

**Range Checks**:
```python
def check_validity(df):
    checks = {
        'temperature': (-50, 50),  # Celsius
        'precipitation': (0, 1000),  # mm
        'humidity': (0, 100),  # percentage
        'roas': (0, 100),  # Reasonable ROAS range
        'ad_spend_google': (0, 1000000),  # Max spend
        'ad_spend_meta': (0, 1000000)
    }

    for field, (min_val, max_val) in checks.items():
        if field not in df.columns:
            continue

        out_of_range = df.filter(
            (pl.col(field) < min_val) | (pl.col(field) > max_val)
        )

        if len(out_of_range) > 0:
            raise DataQualityError(
                f"{field}: {len(out_of_range)} values out of range "
                f"[{min_val}, {max_val}]"
            )
```

**Type Checks**:
```python
def check_types(df):
    expected_types = {
        'date': pl.Date,
        'roas': pl.Float64,
        'ad_spend_google': pl.Float64,
        'temperature': pl.Float64
    }

    for col, expected_type in expected_types.items():
        if col in df.columns:
            actual_type = df[col].dtype
            if actual_type != expected_type:
                raise DataQualityError(
                    f"{col}: expected {expected_type}, got {actual_type}"
                )
```

---

### 3. Consistency

**Definition**: No contradictions in data

**Cross-Field Checks**:
```python
def check_consistency(df):
    # ROAS should align with spend and revenue
    # ROAS = revenue / spend
    if all(col in df.columns for col in ['revenue', 'ad_spend', 'roas']):
        calculated_roas = df['revenue'] / df['ad_spend']
        diff = abs(calculated_roas - df['roas'])

        threshold = 0.01  # 1% tolerance
        inconsistent = df.filter(diff > threshold)

        if len(inconsistent) > 0:
            raise DataQualityError(
                f"ROAS inconsistency: {len(inconsistent)} rows where "
                f"roas != revenue/spend"
            )

    # Date should be chronological (no future dates)
    if 'date' in df.columns:
        future_dates = df.filter(pl.col('date') > pl.lit(datetime.now().date()))
        if len(future_dates) > 0:
            raise DataQualityError(
                f"Future dates detected: {len(future_dates)} rows"
            )
```

---

### 4. Timeliness

**Definition**: Data is fresh enough for use

**Freshness Check**:
```python
def check_timeliness(df, max_age_days=90):
    if 'date' not in df.columns:
        return

    latest_date = df['date'].max()
    age_days = (datetime.now().date() - latest_date).days

    if age_days > max_age_days:
        raise DataQualityError(
            f"Data is {age_days} days old (threshold: {max_age_days} days)"
        )
```

**Coverage Check** (90-day requirement):
```python
def check_coverage(df, required_days=90):
    if 'date' not in df.columns:
        return

    date_range = (df['date'].max() - df['date'].min()).days
    if date_range < required_days:
        raise DataQualityError(
            f"Data coverage is {date_range} days (required: {required_days})"
        )

    # Check for gaps
    expected_dates = set(pd.date_range(
        start=df['date'].min(),
        end=df['date'].max(),
        freq='D'
    ).date)

    actual_dates = set(df['date'].to_list())
    missing_dates = expected_dates - actual_dates

    gap_threshold = 0.05  # 5% missing dates allowed
    if len(missing_dates) / len(expected_dates) > gap_threshold:
        raise DataQualityError(
            f"{len(missing_dates)} missing dates "
            f"({len(missing_dates)/len(expected_dates):.1%} gap)"
        )
```

---

### 5. Uniqueness

**Definition**: No duplicate records

**Duplicate Check**:
```python
def check_uniqueness(df, unique_keys=['date', 'location']):
    duplicates = df.group_by(unique_keys).agg(
        pl.count().alias('count')
    ).filter(pl.col('count') > 1)

    if len(duplicates) > 0:
        raise DataQualityError(
            f"{len(duplicates)} duplicate records found on {unique_keys}"
        )
```

---

## Data Quality Report

**Generate before training**:

```python
def generate_quality_report(df):
    report = {
        'timestamp': datetime.now().isoformat(),
        'total_rows': len(df),
        'date_range': {
            'start': str(df['date'].min()),
            'end': str(df['date'].max()),
            'days': (df['date'].max() - df['date'].min()).days
        },
        'completeness': {},
        'validity': {},
        'uniqueness': {},
        'summary': 'PASS'  # or 'FAIL'
    }

    # Completeness
    for col in df.columns:
        null_count = df[col].is_null().sum()
        report['completeness'][col] = {
            'null_count': null_count,
            'null_pct': null_count / len(df)
        }

    # Validity (outliers)
    for col in ['temperature', 'roas', 'ad_spend_google']:
        if col in df.columns:
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            outliers = df.filter(
                (pl.col(col) < q1 - 1.5 * iqr) |
                (pl.col(col) > q3 + 1.5 * iqr)
            )
            report['validity'][col] = {
                'outlier_count': len(outliers),
                'outlier_pct': len(outliers) / len(df)
            }

    # Save report
    with open('state/analytics/data_quality.json', 'w') as f:
        json.dump(report, f, indent=2)

    return report
```

**Example Report**:
```json
{
  "timestamp": "2025-10-23T12:00:00Z",
  "total_rows": 90,
  "date_range": {
    "start": "2025-07-25",
    "end": "2025-10-23",
    "days": 90
  },
  "completeness": {
    "date": {"null_count": 0, "null_pct": 0.0},
    "roas": {"null_count": 2, "null_pct": 0.022},
    "temperature": {"null_count": 0, "null_pct": 0.0}
  },
  "validity": {
    "temperature": {"outlier_count": 1, "outlier_pct": 0.011},
    "roas": {"outlier_count": 0, "outlier_pct": 0.0}
  },
  "uniqueness": {
    "duplicate_count": 0
  },
  "summary": "PASS"
}
```

---

## Data Quality Baselines

**Store baseline metrics** for comparison:

**Location**: `state/analytics/data_quality_baselines.json`

**Content**:
```json
{
  "temperature": {
    "mean": 21.5,
    "std": 8.2,
    "min": -5.0,
    "max": 38.0,
    "q1": 15.0,
    "q3": 28.0
  },
  "roas": {
    "mean": 3.45,
    "std": 0.85,
    "min": 1.20,
    "max": 6.50,
    "q1": 2.80,
    "q3": 4.10
  }
}
```

**Use**: Detect distribution shifts

```python
def check_distribution_shift(df, baselines):
    shifts = {}

    for col, baseline in baselines.items():
        if col not in df.columns:
            continue

        current_mean = df[col].mean()
        current_std = df[col].std()

        # Z-score of current mean relative to baseline
        z_score = abs(current_mean - baseline['mean']) / baseline['std']

        if z_score > 2:  # >2 std dev shift
            shifts[col] = {
                'baseline_mean': baseline['mean'],
                'current_mean': current_mean,
                'z_score': z_score,
                'severity': 'WARNING' if z_score < 3 else 'CRITICAL'
            }

    return shifts
```

---

## Data Quality Critic

**Critic**: `data_quality`

**Triggers**: Before model training

**Checks**:
1. Completeness (<5% missing)
2. Validity (values in ranges)
3. Consistency (no contradictions)
4. Timeliness (<90 days old)
5. Uniqueness (no duplicates)
6. Distribution shift (vs baselines)

**Authority**: Blocking (must fix before training)

**Report Format**:
```json
{
  "critic": "data_quality",
  "status": "fail",
  "severity": "blocking",
  "issues": [
    {
      "dimension": "completeness",
      "field": "roas",
      "message": "2.2% missing values (threshold: 5%)",
      "severity": "warning"
    },
    {
      "dimension": "validity",
      "field": "temperature",
      "message": "1 outlier detected (55°C)",
      "severity": "warning"
    }
  ],
  "exitCriteria": "All dimensions pass OR warnings documented with justification"
}
```

---

## Synthetic Data Validation

**For demo/testing**: Ensure synthetic data is realistic

**Checks**:
1. Correlations match real data (±20%)
2. Distributions match real data (KS test p>0.05)
3. Seasonality present (if applicable)
4. No obvious patterns (e.g., all values = 3.0)

**Script**: `scripts/weather/generate_synthetic_tenants.py`

**Validation**: `state/analytics/synthetic_data_validation.json`

---

## Data Quality Automation

### Pre-Training Check

```python
def validate_before_training(df):
    """Run all quality checks before training"""
    try:
        check_completeness(df, required_fields)
        check_validity(df)
        check_consistency(df)
        check_timeliness(df, max_age_days=90)
        check_uniqueness(df, unique_keys=['date', 'location'])

        # Generate report
        report = generate_quality_report(df)

        # Check distribution shift
        baselines = load_baselines()
        shifts = check_distribution_shift(df, baselines)

        if shifts:
            log_warning("Distribution shifts detected", shifts)

        return True

    except DataQualityError as e:
        log_error("Data quality check failed", str(e))
        return False
```

### Integration with Training Pipeline

```python
def train_model(data_path):
    # Load data
    df = pl.read_csv(data_path)

    # MANDATORY: Validate data quality
    if not validate_before_training(df):
        raise Exception("Data quality checks failed - cannot train model")

    # Proceed with training
    X, y = prepare_features(df)
    model = BayesianRidge()
    model.fit(X, y)

    return model
```

---

## References

- [Data Quality Validation Script](/shared/services/data_quality.py)
- [Synthetic Data Generation](/scripts/weather/generate_synthetic_tenants.py)
- [Data Quality Report](/state/analytics/data_quality.json)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
