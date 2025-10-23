# WeatherVane Notebooks

This directory contains Jupyter notebooks for reproducible analysis, validation, and experimentation.

## Available Notebooks

### `model_validation_comprehensive.ipynb`

**Purpose**: Comprehensive validation of weather-aware MMM models against objective performance thresholds.

**Use Cases**:
- Validate newly trained models
- Generate validation reports for stakeholders
- Diagnose model performance issues
- Track model quality over time

**Requirements**:
- Python 3.11+
- Dependencies: `numpy`, `pandas`, `matplotlib`, `seaborn`
- Training results: `storage/models/mmm_cv_results.json`

**Usage**:
```bash
# From notebooks directory
jupyter notebook model_validation_comprehensive.ipynb

# Or use Jupyter Lab
jupyter lab model_validation_comprehensive.ipynb
```

**Outputs**:
- Validation report: `storage/models/validation_results_notebook.json`
- Summary metrics: `storage/models/validation_summary.json`
- Visualizations: `experiments/mmm_v2/figures/validation_r2_analysis.png`

**Key Features**:
1. **Threshold Validation**: Validates against R² ≥ 0.50, stability, and RMSE requirements
2. **Extended Checks**: Fold stability, data quality, reproducibility verification
3. **Failure Analysis**: Identifies common failure patterns and problematic models
4. **Visualizations**: R² distribution, passing/failing comparison, stability plots
5. **Weather Elasticity**: Analyzes weather sensitivity in passing models
6. **Diagnostics**: Checks for NaN/Inf values, negative R², insufficient folds
7. **Recommendations**: Provides actionable improvement strategies

## Running Notebooks

### Prerequisites

Install Jupyter and required dependencies:

```bash
pip install jupyter notebook jupyterlab
pip install numpy pandas matplotlib seaborn
```

### Start Jupyter

```bash
# From project root
cd notebooks
jupyter notebook

# Or use Jupyter Lab
jupyter lab
```

### Execution Order

When running the validation notebook:

1. **Train models first**: Run `python scripts/train_mmm_synthetic_cv.py`
2. **Check inputs exist**: Verify `storage/models/mmm_cv_results.json` exists
3. **Run notebook**: Execute all cells sequentially
4. **Review outputs**: Check validation report and figures

## Integration with Validation Pipeline

The notebooks use the same validation utilities as the command-line scripts:

```python
from apps.model.validate_model_performance import (
    ValidationThresholds,
    validate_all_models,
    generate_validation_report,
)
```

This ensures consistency between interactive analysis (notebooks) and automated validation (CI/CD).

## Best Practices

### 1. Version Control
- **DO NOT** commit notebook outputs (`.ipynb` with cell outputs)
- Use `.gitignore` to exclude large outputs
- Commit only source code cells

### 2. Reproducibility
- Set random seeds for reproducibility
- Document data sources and versions
- Include timestamps in outputs

### 3. Documentation
- Add markdown cells explaining each section
- Document assumptions and limitations
- Include references to related code/docs

### 4. Performance
- Use sampling for large datasets (e.g., first 10 models for diagnostics)
- Save intermediate results to avoid recomputation
- Clear outputs before committing

## Troubleshooting

### Issue: "CV results not found"
**Solution**: Run training script first:
```bash
python scripts/train_mmm_synthetic_cv.py --n-folds 5
```

### Issue: "Module not found"
**Solution**: Add project root to Python path:
```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd().parent))
```

### Issue: "Kernel dies during execution"
**Solution**: Large datasets may cause memory issues. Try:
- Restart kernel and clear outputs
- Sample data instead of loading all models
- Increase available memory

### Issue: "Figures not saving"
**Solution**: Ensure output directory exists:
```python
FIGURES_DIR = Path('../experiments/mmm_v2/figures')
FIGURES_DIR.mkdir(parents=True, exist_ok=True)
```

## Related Documentation

- **Validation Guide**: `docs/MODEL_VALIDATION_GUIDE.md`
- **Performance Thresholds**: `docs/MODEL_PERFORMANCE_THRESHOLDS.md`
- **Training Pipeline**: `scripts/train_mmm_synthetic_cv.py`
- **Validation Script**: `apps/model/validate_model_performance.py`
- **Test Suite**: `tests/model/test_validate_model_performance.py`

## Contributing

When adding new notebooks:

1. Use clear, descriptive filenames
2. Include purpose and usage in this README
3. Add markdown cells for documentation
4. Test end-to-end execution
5. Ensure reproducibility
6. Update `.gitignore` for outputs
