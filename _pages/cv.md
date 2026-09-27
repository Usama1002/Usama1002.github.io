---
layout: archive
title: "CV"
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}

A PDF version of this CV is available [here]({{ base_path }}/files/Muhammad-Usama-CV.pdf).

Education
======
* Ph.D. in Electrical Engineering, Korea Advanced Institute of Science and Technology (KAIST), 2019 - 2026
  * Advisor: Prof. Dong Eui Chang
  * Thesis: Learning Latent Representations for Anomaly Detection and Reinforcement-Learning-Based Equalizer Optimization in High-Speed DRAM Systems
* M.S. in Electrical Engineering, Korea Advanced Institute of Science and Technology (KAIST), 2017 - 2019
  * Advisor: Prof. Dong Eui Chang
  * Thesis: Towards Robust Neural Networks and Efficient Exploration in Reinforcement Learning
* B.E. in Electrical Engineering, National University of Sciences and Technology (NUST), Pakistan, 2013 - 2017
  * President of Pakistan Gold Medal, Best Graduate in Electrical Engineering (GPA 3.99/4.0)

Employment
======
* AI Engineer, Agent Astro, May 2026 - Present (Remote, US)
  * Design the AI and data architecture for an FDA regulatory-intelligence platform, including a retrieval-augmented generation system over FDA 510(k), PMA, and recall data, a knowledge-graph-based device-comparison service, and a multi-agent research pipeline.
* AI Initiative Team Lead, Braindeck Inc., Oct 2025 - Present (Seoul, South Korea)
  * Lead development of a custom automatic speech recognition model for Korean-language users with dysarthria, integrated into a real-time avatar communication platform, along with voice cloning and text-to-speech pipelines.
* AI Researcher, Tianjin Medical University Eye Hospital, Oct 2025 - Present (Tianjin, China)
  * Develop machine learning models for pediatric myopia progression prediction, cross-domain diabetic retinopathy screening, and ocular surface disease grading.
* AI Lead, Brain Box Automations, Jul 2025 - Present (Remote)
  * Develop production AI agent systems using FastAPI, LangGraph, and LangChain, deployed on AWS, GCP, and Azure.
* Graduate Student Researcher, KAIST, Aug 2017 - Aug 2026 (Daejeon, South Korea)
  * Machine learning for DRAM signal integrity and equalizer optimization in collaboration with Samsung DS; fairness and transparency in representation learning; deep reinforcement learning for robotic control, applied to a Furuta pendulum, quadcopters, and autonomous ground robots.
* Freelance AI/ML Developer and Consultant, Self-Employed, Aug 2023 - Sep 2025 (Remote)
  * Delivered production AI systems for clients, including voice AI pipelines for real-time phone conversations, retrieval-augmented generation systems, and survival-analysis models for industrial equipment reliability prediction.
* Research Assistant, RISE Lab, NUST, Feb 2016 - Jul 2017 (Islamabad, Pakistan)
  * Developed a wearable fNIRS device for real-time hemodynamic brain profiling.
* Intern Application Engineer, National Instruments, Jul 2016 - Sep 2016 (Islamabad, Pakistan)
  * Completed LabVIEW certification training; implemented a hybrid control system for an inverted pendulum on NI hardware.

Skills
======
* Machine Learning: deep learning, reinforcement learning, large language models, multi-agent systems, parameter-efficient fine-tuning (LoRA), computer vision
* LLM Systems: retrieval-augmented generation, vector databases, knowledge graphs, MCP server development, LLMOps
* Voice AI: automatic speech recognition, text-to-speech, speech-to-speech pipelines, voice cloning
* Programming and Tools: Python, PyTorch, TensorFlow, TypeScript, React, FastAPI, Git, Docker
* Cloud and Databases: AWS, GCP, Azure, PostgreSQL, Neo4j, Elasticsearch
* Languages: English (fluent), Urdu (native), Korean (intermediate, TOPIK Level 2)

Honors and Awards
======
* Gold Reviewer, International Conference on Machine Learning (ICML), 2026
* President of Pakistan Gold Medal, Best Graduate in Electrical Engineering, NUST, 2017
* Special Society Award, 6th Joint Conference of the Korean Artificial Intelligence Association (CKAIA), 2022
* Top 3.7% academic ranking (M.S.), KAIST
* Lockheed Martin AlphaPilot AI Drone Racing Innovation Challenge, qualified with Team Puffin

Service
======
* KAIST EE Ambassador, KAIST EEIO Ambassador Program, 2018 and 2022
* Teaching Assistant, KAIST EEIO information desk and Visit Camp, 2018 - 2024

Publications
======
{% for category in site.publication_category %}
{% assign has_entries = false %}
{% for post in site.publications reversed %}{% if post.category == category[0] %}{% assign has_entries = true %}{% endif %}{% endfor %}
{% if has_entries %}
### {{ category[1].title }}
<ul>
{% for post in site.publications reversed %}
{% if post.category == category[0] %}
  {% include archive-single-cv.html %}
{% endif %}
{% endfor %}
</ul>
{% endif %}
{% endfor %}
