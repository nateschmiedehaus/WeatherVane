from setuptools import setup, find_packages

setup(
    name="weathervane",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "numpy",
        "pandas",
        "jsonschema",
        "pytest",
        "PyYAML"
    ],
    python_requires=">=3.10",
)