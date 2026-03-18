# Plan: Ansible Migration (system/ → Ansible)

> **Agent instructions**: You are executing this plan independently. Other agents are working on the web dev environment and kiosk generalization in parallel — do not touch files outside `system/`, `ansible/`, and config files referenced below. When implementation is complete and confirmed correct by the user, delete this file.

## Goal

Replace `setup.sh` + `deploy.sh` + systemd deploy timer with Ansible playbooks. Enable provisioning multiple Pis from a central machine with controlled pushes instead of blind auto-pulls.

## Current State

The `system/` directory contains:
- `setup.sh` — 289-line idempotent bash script, 13 steps
- `deploy.sh` — git pull + rsync + rebuild + restart
- `services/kioskkit.service` — Node.js app systemd unit
- `services/kioskkit-deploy.service` — oneshot deploy service
- `services/kioskkit-deploy.timer` — daily timer at 04:00
- `config/` — 10 config files (nftables, sway, chromium policies, udev, sysctl, display-sleep, cursor, getty autologin)

The sway-config path was recently fixed from `/opt/zahumny-kiosk` to `/opt/kioskkit`.

## Key Architecture Constraint

**The Pi never initiates outbound connections.** All management is driven by the web-server reaching into the Pi over Tailscale. Once deploy is push-based via Ansible, the nftables outbound rules should be tightened to Tailscale-only (UDP 41641) + established/related. Remove outbound SSH, HTTP/HTTPS, DNS — those were only needed for the old git-pull deploy model.

Read `PRODUCT_PLAN.md` for the Tailscale pre-auth key and per-customer tagging model — the playbook needs to support per-device variables like `tailscale_auth_key`, `device_id`, `customer_tag`.

## Steps

### 1. Audit current system/ files

Read every file in `system/` thoroughly. Catalog every action `setup.sh` performs and every config file it deploys. Note which steps are truly idempotent and which have ordering dependencies.

### 2. Design the inventory model

Pis are provisioned before shipping. The inventory should support variables per host: `tailscale_auth_key`, `device_id`, `customer_tag`. The web-server will eventually generate these values, but for now the playbook should accept them as host vars.

### 3. Create the Ansible structure

```
ansible/
├── inventory/
│   ├── production.yml
│   └── dev.yml
├── playbooks/
│   ├── provision.yml       # full initial setup (replaces setup.sh)
│   ├── deploy.yml          # code update + rebuild (replaces deploy.sh + timer)
│   └── configure.yml       # config-only changes (no rebuild)
├── roles/
│   └── kioskkit/
│       ├── tasks/
│       │   ├── main.yml
│       │   ├── packages.yml
│       │   ├── user.yml
│       │   ├── app.yml
│       │   ├── systemd.yml
│       │   ├── display.yml
│       │   ├── security.yml
│       │   ├── watchdog.yml
│       │   ├── filesystem.yml
│       │   └── tailscale.yml
│       ├── templates/       # Jinja2 versions of config files
│       ├── files/           # Static files (udev rules, sysctl, etc.)
│       ├── handlers/
│       │   └── main.yml     # restart services, reload rules
│       └── defaults/
│           └── main.yml     # default variables
├── ansible.cfg
└── requirements.yml
```

### 4. Convert each setup.sh section to Ansible tasks

Map the 13 steps to role tasks. Use `ansible.builtin.apt`, `ansible.builtin.user`, `ansible.builtin.template`, `ansible.builtin.copy`, `ansible.builtin.systemd`, etc. Config files that need variable substitution (sway-config with install path, nftables, systemd units) become Jinja2 templates. Static files (udev rules, sysctl) stay as-is in `files/`.

### 5. Replace deploy.sh + timer with deploy.yml playbook

Instead of the Pi pulling from git on a timer, the operator runs `ansible-playbook deploy.yml` from their machine. This pushes built artifacts to the Pi via Tailscale SSH. No git clone on the Pi, no deploy key on the Pi, no outbound SSH from the Pi.

### 6. Tighten nftables

Create a new `nftables.conf.j2` template that drops all outbound except:
- Loopback
- Established/related
- Tailscale UDP 41641
- DHCP (needed for initial network config)

Remove: outbound SSH (port 22), HTTP/HTTPS (80/443), DNS (53), NTP (123). These were only needed for git pull + apt. With Ansible push-based deploys, the Pi doesn't need any of them.

### 7. Clean up old files

Delete: `setup.sh`, `deploy.sh`, `services/kioskkit-deploy.service`, `services/kioskkit-deploy.timer`. Keep `services/kioskkit.service` as a source for the Ansible template. Keep `config/` files as sources that Ansible references (or move them into the role's `files/` and `templates/`).

### 8. Document testing approach

Document how to test with a local VM (QEMU/libvirt Pi image or a Debian trixie VM standing in for a Pi). The `inventory/dev.yml` should point at this. Add a brief README in `ansible/`.
