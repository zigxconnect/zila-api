/**
 * Dynamic Multi-Domain Curriculum Service
 * Powers dynamic cohort tracks across Machine Learning, Web, Cybersecurity, Embedded, Mobile Apps, and Cloud.
 */

export interface CurriculumTrackLevel {
  level: "beginner" | "intermediate" | "advance" | string;
  modules: string[];
}

export interface CurriculumDomain {
  id: string;
  name: string;
  description: string;
  levels: Record<string, string[]>;
}

export class CurriculumService {
  private static readonly DOMAINS: Record<string, CurriculumDomain> = {
    ml: {
      id: "ml",
      name: "Machine Learning & AI",
      description: "Classical ML, Deep Learning, Computer Vision, Generative AI & Autonomous Agents",
      levels: {
        beginner: ["1_python", "2_eda_and_classical_ml"],
        intermediate: ["1_deeplearning_and_neural_nets", "2_computer_vision_and_nlp"],
        advance: ["1_generative_ai_and_agents", "2_reinforcement_learning_and_llms"],
      },
    },
    web: {
      id: "web",
      name: "Web & Fullstack Engineering",
      description: "Modern frontend frameworks, distributed backends, REST/GraphQL APIs & Cloud deployments",
      levels: {
        beginner: ["1_html_css_javascript", "2_typescript_and_react"],
        intermediate: ["1_nodejs_and_microservices", "2_databases_and_graphql"],
        advance: ["1_distributed_systems_and_wasm", "2_fullstack_architecture"],
      },
    },
    cyber: {
      id: "cyber",
      name: "Cybersecurity & InfoSec",
      description: "Defensive & offensive security, penetration testing, reverse engineering & SOC operations",
      levels: {
        beginner: ["1_networking_and_linux_security", "2_cryptography_basics"],
        intermediate: ["1_penetration_testing_and_soc", "2_web_app_security_owasp"],
        advance: ["1_malware_analysis_and_reversing", "2_zero_trust_and_cloud_security"],
      },
    },
    embeded: {
      id: "embeded",
      name: "Embedded Systems & IoT",
      description: "Firmware programming in C/C++, RTOS, hardware protocols & Edge computing",
      levels: {
        beginner: ["1_c_and_embedded_fundamentals", "2_microcontrollers_and_gpio"],
        intermediate: ["1_rtos_and_firmware_dev", "2_communication_protocols_i2c_spi"],
        advance: ["1_tinyml_and_edge_computing", "2_secure_firmware_and_bootloaders"],
      },
    },
    app: {
      id: "app",
      name: "Mobile App Development",
      description: "Cross-platform mobile apps with Flutter, React Native, native integrations & offline-first systems",
      levels: {
        beginner: ["1_mobile_ui_and_dart_flutter", "2_state_management_and_apis"],
        intermediate: ["1_native_bridges_and_offline_first", "2_performance_and_security"],
        advance: ["1_cross_platform_arch_and_ci_cd", "2_multithreaded_mobile_systems"],
      },
    },
    cloud: {
      id: "cloud",
      name: "Cloud Infrastructure & DevOps",
      description: "Containerization, Kubernetes, Terraform IaC, CI/CD GitOps pipelines & Site Reliability",
      levels: {
        beginner: ["1_linux_and_containers_docker", "2_ci_cd_and_gitops"],
        intermediate: ["1_kubernetes_orchestration", "2_terraform_and_infrastructure_as_code"],
        advance: ["1_site_reliability_and_chaos_eng", "2_multi_cloud_and_service_mesh"],
      },
    },
  };

  /**
   * Retrieves all available curriculum domains
   */
  static getAllDomains(): CurriculumDomain[] {
    return Object.values(this.DOMAINS);
  }

  /**
   * Retrieves a specific curriculum domain by ID (case-insensitive)
   */
  static getDomain(domainId: string): CurriculumDomain | null {
    if (!domainId) return null;
    return this.DOMAINS[domainId.toLowerCase().trim()] || null;
  }

  /**
   * Retrieves modules for a domain and level. If custom/unknown, dynamically provides a safe default module.
   */
  static getModules(domainId: string, level: string): string[] {
    const domain = this.getDomain(domainId);
    if (!domain) {
      return [`1_${this.sanitizePathComponent(domainId || "general")}_fundamentals`];
    }

    const normLevel = level.toLowerCase().trim();
    const modules = domain.levels[normLevel];
    if (modules && modules.length > 0) {
      return modules;
    }

    return [`1_${domain.id}_${normLevel}`];
  }

  /**
   * Sanitizes a string for use in file paths and branch names
   */
  static sanitizePathComponent(input: string): string {
    return (input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "module";
  }
}
