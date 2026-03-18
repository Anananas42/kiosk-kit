# KioskKit Ansible

Ansible playbooks for provisioning and managing KioskKit Raspberry Pi devices.

## Prerequisites

- Ansible 2.14+ on the control machine
- SSH access to target Pi (via Tailscale or local network)
- Python 3 on the target Pi (included in Raspberry Pi OS)

## Usage

```bash
cd ansible/

# Full initial provisioning (replaces setup.sh)
ansible-playbook playbooks/provision.yml -l <host>

# Push code update + rebuild (replaces deploy.sh)
ansible-playbook playbooks/deploy.yml -l <host>

# Config-only update (no rebuild)
ansible-playbook playbooks/configure.yml -l <host>

# Use dev inventory
ansible-playbook -i inventory/dev.yml playbooks/provision.yml -l dev-pi
```

## Per-device variables

Each host needs these variables (set in `inventory/host_vars/<hostname>.yml` or inline in the inventory):

| Variable | Description |
|---|---|
| `tailscale_auth_key` | Tailscale pre-auth key for the device |
| `device_id` | Unique device identifier (e.g., `001`) |
| `customer_tag` | Tailscale ACL tag (e.g., `customer-42`) |

## Testing with a local VM

1. Create a Debian trixie or Raspberry Pi OS VM (QEMU/libvirt)
2. Enable SSH, set up a `pi` user with sudo
3. Add the VM IP to `inventory/dev.yml`
4. Run: `ansible-playbook -i inventory/dev.yml playbooks/provision.yml -l dev-pi`
