# Good Example: ML Model with Performance Validation

**Task**: Train time-series forecasting model for energy demand

**Verification Level Achieved**: Level 2 (Smoke tested with performance metrics)

---

## Implementation

```python
class EnergyForecastModel:
    def __init__(self):
        self.model = LightGBM()

    def train(self, X_train, y_train):
        self.model.fit(X_train, y_train)

    def predict(self, X_test):
        return self.model.predict(X_test)
```

---

## Verification

### Level 1: Compilation ✅
```bash
python -m py_compile energy_forecast_model.py
# No syntax errors
```

### Level 2: Smoke Testing with Performance Metrics ✅
```python
def test_model_accuracy():
    # Load test data (known dataset)
    X_train, X_test, y_train, y_test = load_test_data()

    # Train model
    model = EnergyForecastModel()
    model.train(X_train, y_train)

    # Predict on test set
    predictions = model.predict(X_test)

    # Validate performance
    mse = mean_squared_error(y_test, predictions)
    mae = mean_absolute_error(y_test, predictions)
    r2 = r2_score(y_test, predictions)

    # Assert performance thresholds
    assert mse < 100.0, f"MSE too high: {mse}"
    assert mae < 8.0, f"MAE too high: {mae}"
    assert r2 > 0.85, f"R² too low: {r2}"

    print(f"✅ Model performance: MSE={mse:.2f}, MAE={mae:.2f}, R²={r2:.3f}")


def test_model_on_edge_cases():
    model = EnergyForecastModel()
    model.train(X_train, y_train)

    # Test edge case: all zeros
    zero_input = np.zeros((10, X_test.shape[1]))
    predictions = model.predict(zero_input)
    assert not np.any(np.isnan(predictions)), "Model produces NaN on zero input"

    # Test edge case: extreme values
    extreme_input = X_test * 1000
    predictions = model.predict(extreme_input)
    assert np.all(predictions > 0), "Model should produce positive predictions"


def test_model_training_converges():
    model = EnergyForecastModel()

    # Train and measure loss over time
    losses = []
    for epoch in range(10):
        model.train(X_train, y_train)
        loss = model.evaluate(X_test, y_test)
        losses.append(loss)

    # Loss should decrease (model learning)
    assert losses[-1] < losses[0], "Model not learning (loss not decreasing)"
    print(f"✅ Training converged: {losses[0]:.2f} → {losses[-1]:.2f}")
```

**Test Output**:
```
test_model_accuracy:
✅ Model performance: MSE=75.32, MAE=6.18, R²=0.892

test_model_on_edge_cases:
✅ All edge cases passed

test_model_training_converges:
✅ Training converged: 120.45 → 75.32

3 tests passed
```

---

## What Was Tested (Level 2 ✅)
- Model trains without errors
- Predictions on test set meet performance thresholds (MSE, MAE, R²)
- Edge cases handled (zeros, extremes)
- Training converges (loss decreases)
- No NaN or infinite predictions

## What Was NOT Tested (Level 3 ⏳)
- Production data distribution (may differ from test set)
- Inference latency at scale (100+ predictions/sec)
- Model drift over time
- Integration with production pipeline

## What Was NOT Tested (Level 4 ⏳)
- Real user forecasts
- Long-term accuracy (30-day monitoring)
- Cost per prediction in production

---

## Why This is Good

### Performance Metrics Documented
- Not just "model trained" but specific thresholds (MSE < 100, R² > 0.85)
- Metrics logged in test output
- Regression tests prevent performance degradation

### Edge Cases Tested
- Zero input, extreme values
- NaN/infinite checks
- Training convergence validated

### Honest Gap Documentation
- Level 3 and 4 explicitly marked as NOT tested
- Production data, latency, drift deferred with justification

---

## Key Takeaway

**ML models require performance validation** - "model trained" is not enough. Level 2 for ML means:
- Performance metrics measured (MSE, MAE, R², etc.)
- Edge cases tested
- Training convergence validated
- Thresholds documented
