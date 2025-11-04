# Bad Example: ML Model - "Trained" Without Validation

**Task**: Train time-series forecasting model for energy demand

**Claimed**: "Model trained successfully"
**Actual**: Level 1 only (script runs, no validation)

**❌ NO PERFORMANCE METRICS**

---

## What Was Claimed

> "Energy forecasting model trained successfully. Training script completed without errors."

**Evidence**:
```bash
python train_model.py
# Output: Training complete. Model saved to model.pkl
```

---

## What Was ACTUALLY Achieved

### Level 1: Compilation ✅
- Script runs without syntax errors
- Model object created
- File saved to disk

### Level 2: Performance Validation ❌ MISSING
- **NO accuracy metrics** (MSE, MAE, R²)
- **NO test set evaluation**
- **NO edge case testing**
- **NO performance thresholds**

---

## Why This is Bad

### Unknown Performance
```
❓ What's the MSE? Unknown
❓ What's the R²? Unknown
❓ Is it better than baseline? Unknown
❓ Does it predict reasonable values? Unknown
```

**Model could be**:
- Predicting all zeros
- Producing NaN values
- Worse than random guessing
- **We have no idea!**

### Will Fail in Production
```python
# User tries to use model:
predictions = model.predict(X_production)

# Issues that would be found with Level 2:
# ❌ Predictions are all NaN
# ❌ Predictions are negative (impossible for energy)
# ❌ R² = 0.001 (useless model)
# ❌ MSE = 10,000 (terrible accuracy)
```

---

## How to Fix

### Add Performance Validation
```python
def validate_model():
    model = load_model('model.pkl')
    X_test, y_test = load_test_data()

    predictions = model.predict(X_test)

    # Calculate metrics
    mse = mean_squared_error(y_test, predictions)
    mae = mean_absolute_error(y_test, predictions)
    r2 = r2_score(y_test, predictions)

    # Assert thresholds
    assert mse < 100.0, f"MSE too high: {mse}"
    assert mae < 8.0, f"MAE too high: {mae}"
    assert r2 > 0.85, f"R² too low: {r2}"

    # Check for NaN/infinity
    assert not np.any(np.isnan(predictions)), "Model produces NaN"
    assert not np.any(np.isinf(predictions)), "Model produces infinity"

    # Check reasonable range
    assert np.all(predictions > 0), "Negative predictions (impossible)"
    assert np.all(predictions < 10000), "Unrealistic predictions"

    return {
        'mse': mse,
        'mae': mae,
        'r2': r2,
        'passed': True
    }
```

**Run validation**:
```bash
python validate_model.py

# Output:
# MSE: 75.32
# MAE: 6.18
# R²: 0.892
# ✅ All thresholds passed
```

---

## Red Flags

- ⚠️ Claimed "trained successfully" without metrics
- ⚠️ No test set evaluation
- ⚠️ No performance thresholds documented
- ⚠️ "Script ran" presented as completion evidence

---

## Key Takeaway

**"Model trained" ≠ "Model works"**

Level 2 for ML requires:
- Performance metrics (MSE, MAE, R², etc.)
- Test set evaluation
- Edge case validation
- Thresholds documented

Without these, you have no idea if model is useful.
