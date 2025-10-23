# Weather Model Backtest Summary

*Total sample size:* **21 observations** across 3 tenants.
*MAE improvement:* Weather-aware model reduced error from 47.9 to 15.6 (67.4% improvement).
*Win rate:* Weather-aware model beat the control on 100.0% of comparisons with an average absolute error reduction of 32.2.
*Coverage:* Prediction intervals captured actuals 100.0% of the time.

| Tenant | Weather MAE | Control MAE | MAE Δ | MAE Δ % | Win rate | Coverage | Samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| aurora-collective | 12.3 | 33.9 | 21.6 | 63.7% | 100.0% | 100.0% | 7 |
| demo-tenant | 15.6 | 53.5 | 37.9 | 70.8% | 100.0% | 100.0% | 8 |
| northwind-outdoors | 19.5 | 56.7 | 37.2 | 65.6% | 100.0% | 100.0% | 6 |

## Observations
- All tenants show double-digit percentage reductions in MAE when weather features are enabled.
- The weather-aware model wins the vast majority of individual comparisons, validating uplift consistency.
- Interval coverage stays within tolerance, indicating the quantile calibration remains trustworthy for decision support.

## Reproduction
```bash
python -m apps.model.weather_backtest --data-root experiments/weather/backtests
```
The CLI prints the Markdown table above using the JSON datasets checked into `experiments/weather/backtests`.
