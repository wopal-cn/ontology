# Validation domain layer
#
# Provides:
#   - check_doc_plan: Plan document completeness validation
#   - check_user_validation: User Validation section gate check
#   - ValidationError: Exception for validation failures
#
# Ported from lib/check-doc.sh, lib/plan.sh

from .check_doc import check_doc_plan, check_user_validation, ValidationError

__all__ = ['check_doc_plan', 'check_user_validation', 'ValidationError']