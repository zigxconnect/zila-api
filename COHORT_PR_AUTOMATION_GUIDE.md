# Cohort Task PR Automation & Scoring Rubric Guide

## 1. Overview
The Zigex Platform incorporates an automated behind-the-scenes GitHub Pull Request pipeline for intern task submissions. When interns execute `submit-task` (or `zila-submit`), the agent formats their daily report, creates an isolated branch, commits the exercise to the open-source cohort repository, and opens a pull request for supervisor review.

---

## 2. Cohort Repository Specification
- **Primary Sample Repository:** `https://github.com/iws3/sample_repo_zila.git`
- **Contributor Working Directory:**
  ```
  contributors/<student_github_username>/<level>/<module_name>/day-<day>/exercise.md
  ```
- **Automated Branch Naming:**
  ```
  <module_name>/<student_github_username>/day-<day>
  ```
  *Example:* `1_python/iws3/day-1`

---

## 3. Curriculum Tracks & Modules
| Track Level | Module Name | Description |
| :--- | :--- | :--- |
| **Beginner** | `1_python` | Python fundamentals, data structures, and CLI tools |
| **Beginner** | `2_eda_and_classical_ml` | Exploratory data analysis, scikit-learn algorithms |
| **Intermediate** | `1_deeplearning_and_neural_nets` | PyTorch architectures, backprop, custom tensors |
| **Intermediate** | `2_computer_vision_and_nlp` | Convolutional nets, transformers, embeddings |
| **Advance** | `1_generative_ai_and_agents` | LLM tooling, function calling, autonomous agents |
| **Advance** | `2_reinforcement_learning_and_llms` | RLHF, policy gradients, custom reward modeling |

---

## 4. Daily Submission Quota Policy
- **Standard Pace:** 1 Pull Request per calendar day.
- **Hard Limit:** Maximum **2 Pull Requests** per calendar day (UTC).
- Submissions beyond 2 PRs return HTTP 429:
  ```json
  {
    "error": "Daily PR submission quota reached (2/2). You cannot submit more than 2 PRs per day. Please continue tomorrow!",
    "quota": { "allowed": false, "countToday": 2, "remainingToday": 0, "maxDaily": 2 }
  }
  ```

---

## 5. Normalized Evaluation Rubric
All weekly sprint exercises are normalized to **100%** according to curriculum day weights:

| Day | Raw Weight | Normalized Percentage | Focus Area |
| :---: | :---: | :---: | :--- |
| **Day 01** | 1 pt | **12.5%** | Problem formulation & baseline theory |
| **Day 02** | 1 pt | **12.5%** | Data preparation & core implementation |
| **Day 03** | 2 pts | **25.0%** | Optimization, evaluation & unit testing |
| **Day 04** | 4 pts | **50.0%** | Production deployment, challenges & docs |
| **Total** | **8 pts** | **100.0%** | Full weekly curriculum milestone |

---

## 6. Key API Endpoints
- `POST /api/tasks/auto-submit`: Automated background PR submission endpoint.
- `GET /api/tasks/quota`: Checks remaining PR quota for authenticated student.
- `GET /api/tasks/scoring-rubric`: Retrieves normalized day weights and scales.
- `GET /api/github/active`: Resolves sample cohort repository for `downloads`.
