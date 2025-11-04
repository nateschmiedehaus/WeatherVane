"""
Tests for record_task_vector.py CLI script

Verifies:
- Argument parsing
- Workspace validation
- Embedding computation
- Vector writing
- Error handling
- Graceful degradation
"""

import json
import pytest
import sys
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

# Import from parent directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from record_task_vector import (
    parse_files_touched,
    validate_workspace,
    compute_and_validate_embedding,
    create_task_vector,
    write_vector_atomic,
)


class TestParseFilesTouched:
    """Test file list parsing"""

    def test_parse_comma_separated(self):
        result = parse_files_touched('a.ts,b.ts,c.ts')
        assert result == ['a.ts', 'b.ts', 'c.ts']

    def test_handles_whitespace(self):
        result = parse_files_touched('a.ts, b.ts , c.ts')
        assert result == ['a.ts', 'b.ts', 'c.ts']

    def test_returns_none_for_empty(self):
        assert parse_files_touched('') is None
        assert parse_files_touched(None) is None

    def test_returns_none_for_only_whitespace(self):
        result = parse_files_touched('  ,  ,  ')
        assert result is None


class TestValidateWorkspace:
    """Test workspace validation"""

    def test_valid_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = validate_workspace(tmpdir)
            assert path.exists()
            assert path.is_dir()

    def test_nonexistent_path_raises(self):
        with pytest.raises(ValueError, match='does not exist'):
            validate_workspace('/nonexistent/path/12345')

    def test_file_not_directory_raises(self):
        with tempfile.NamedTemporaryFile() as tmp:
            with pytest.raises(ValueError, match='not a directory'):
                validate_workspace(tmp.name)

    def test_resolves_relative_path(self):
        path = validate_workspace('.')
        assert path.is_absolute()


class TestComputeAndValidateEmbedding:
    """Test embedding computation and validation"""

    def test_computes_from_title_only(self):
        embedding = compute_and_validate_embedding(
            title='Test task',
            description=None,
            files_touched=None,
        )
        assert len(embedding) == 384
        assert all(isinstance(x, float) for x in embedding)

    def test_computes_from_all_fields(self):
        embedding = compute_and_validate_embedding(
            title='Test task',
            description='Test description',
            files_touched=['a.ts', 'b.ts'],
        )
        assert len(embedding) == 384

    def test_raises_when_no_metadata(self):
        with pytest.raises(ValueError, match='at least one of'):
            compute_and_validate_embedding(
                title=None,
                description=None,
                files_touched=None,
            )

    def test_validates_embedding_shape(self):
        # Valid embedding should not raise
        embedding = compute_and_validate_embedding(
            title='Valid task',
            description=None,
            files_touched=None,
        )
        # Should be normalized
        import numpy as np
        norm = np.linalg.norm(embedding)
        assert abs(norm - 1.0) < 0.01


class TestCreateTaskVector:
    """Test task vector creation"""

    def test_creates_minimal_vector(self):
        embedding = [0.0] * 384
        vector = create_task_vector(
            task_id='TEST-1',
            embedding=embedding,
            outcome='success',
        )

        assert vector['task_id'] == 'TEST-1'
        assert vector['embedding'] == embedding
        assert 'timestamp' in vector
        assert vector['outcome'] == {'status': 'success'}

    def test_includes_optional_fields(self):
        embedding = [0.0] * 384
        vector = create_task_vector(
            task_id='TEST-2',
            embedding=embedding,
            outcome='success',
            title='Test Title',
            description='Test Description',
            files_touched=['a.ts', 'b.ts'],
            duration_ms=5000,
            quality='high',
            complexity_score=0.75,
        )

        assert vector['title'] == 'Test Title'
        assert vector['description'] == 'Test Description'
        assert vector['files_touched'] == ['a.ts', 'b.ts']
        assert vector['duration_ms'] == 5000
        assert vector['quality'] == 'high'
        assert vector['complexity_score'] == 0.75

    def test_omits_none_optional_fields(self):
        embedding = [0.0] * 384
        vector = create_task_vector(
            task_id='TEST-3',
            embedding=embedding,
            outcome='success',
            title='Test',
            description=None,
        )

        assert 'title' in vector
        assert 'description' not in vector


class TestWriteVectorAtomic:
    """Test atomic vector writing"""

    def test_writes_vector_to_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)

            # Create valid embedding
            embedding = compute_and_validate_embedding(
                title='Test task',
                description=None,
                files_touched=None,
            )

            vector = create_task_vector(
                task_id='TEST-WRITE',
                embedding=embedding,
                outcome='success',
                title='Test task',
            )

            write_vector_atomic(workspace, vector)

            # Verify file exists
            vectors_file = workspace / 'state' / 'quality_graph' / 'task_vectors.jsonl'
            assert vectors_file.exists()

            # Verify content
            content = vectors_file.read_text()
            lines = content.strip().split('\n')
            assert len(lines) == 1

            parsed = json.loads(lines[0])
            assert parsed['task_id'] == 'TEST-WRITE'
            assert parsed['title'] == 'Test task'
            assert len(parsed['embedding']) == 384

    def test_appends_to_existing_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)

            embedding = compute_and_validate_embedding(
                title='Task 1',
                description=None,
                files_touched=None,
            )

            # Write first vector
            vector1 = create_task_vector(
                task_id='TEST-1',
                embedding=embedding,
                outcome='success',
                title='Task 1',
            )
            write_vector_atomic(workspace, vector1)

            # Write second vector
            vector2 = create_task_vector(
                task_id='TEST-2',
                embedding=embedding,
                outcome='success',
                title='Task 2',
            )
            write_vector_atomic(workspace, vector2)

            # Verify both vectors present
            vectors_file = workspace / 'state' / 'quality_graph' / 'task_vectors.jsonl'
            content = vectors_file.read_text()
            lines = content.strip().split('\n')
            assert len(lines) == 2

            parsed1 = json.loads(lines[0])
            parsed2 = json.loads(lines[1])

            assert parsed1['task_id'] == 'TEST-1'
            assert parsed2['task_id'] == 'TEST-2'

    def test_creates_directory_if_not_exists(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            qg_dir = workspace / 'state' / 'quality_graph'

            # Ensure directory doesn't exist
            assert not qg_dir.exists()

            embedding = compute_and_validate_embedding(
                title='Test',
                description=None,
                files_touched=None,
            )

            vector = create_task_vector(
                task_id='TEST-DIR',
                embedding=embedding,
                outcome='success',
                title='Test',
            )

            write_vector_atomic(workspace, vector)

            # Verify directory was created
            assert qg_dir.exists()
            assert qg_dir.is_dir()

    def test_raises_on_invalid_vector(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)

            # Invalid vector (wrong embedding dimensions)
            invalid_vector = {
                'task_id': 'TEST-INVALID',
                'embedding': [0.0] * 100,  # Wrong size
                'timestamp': '2025-10-29T00:00:00Z',
                'outcome': {'status': 'success'},
            }

            with pytest.raises(ValueError, match='validation failed'):
                write_vector_atomic(workspace, invalid_vector)


class TestEndToEnd:
    """End-to-end integration tests"""

    def test_record_task_with_all_fields(self):
        """Test complete workflow with all optional fields"""
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)

            # Compute embedding
            embedding = compute_and_validate_embedding(
                title='Full Test Task',
                description='Complete test with all fields',
                files_touched=['src/a.ts', 'src/b.ts', 'test/a.test.ts'],
            )

            # Create vector
            vector = create_task_vector(
                task_id='E2E-FULL',
                embedding=embedding,
                outcome='success',
                title='Full Test Task',
                description='Complete test with all fields',
                files_touched=['src/a.ts', 'src/b.ts', 'test/a.test.ts'],
                duration_ms=3600000,
                quality='high',
                complexity_score=0.8,
            )

            # Write vector
            write_vector_atomic(workspace, vector)

            # Verify
            vectors_file = workspace / 'state' / 'quality_graph' / 'task_vectors.jsonl'
            content = vectors_file.read_text()
            parsed = json.loads(content.strip())

            assert parsed['task_id'] == 'E2E-FULL'
            assert parsed['title'] == 'Full Test Task'
            assert parsed['description'] == 'Complete test with all fields'
            assert len(parsed['files_touched']) == 3
            assert parsed['duration_ms'] == 3600000
            assert parsed['quality'] == 'high'
            assert parsed['complexity_score'] == 0.8
            assert len(parsed['embedding']) == 384

    def test_record_minimal_task(self):
        """Test workflow with minimal required fields"""
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)

            # Only title
            embedding = compute_and_validate_embedding(
                title='Minimal Task',
                description=None,
                files_touched=None,
            )

            vector = create_task_vector(
                task_id='E2E-MIN',
                embedding=embedding,
                outcome='failure',
                title='Minimal Task',
            )

            write_vector_atomic(workspace, vector)

            # Verify
            vectors_file = workspace / 'state' / 'quality_graph' / 'task_vectors.jsonl'
            content = vectors_file.read_text()
            parsed = json.loads(content.strip())

            assert parsed['task_id'] == 'E2E-MIN'
            assert parsed['title'] == 'Minimal Task'
            assert parsed['outcome']['status'] == 'failure'
            assert 'description' not in parsed
            assert 'files_touched' not in parsed
