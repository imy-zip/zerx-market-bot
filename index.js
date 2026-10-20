
'use strict';

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js');

// ============================================
// CONFIGURATION ZERX MARKET
// ============================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '1195047756910309456';

// Seul ton compte Discord peut utiliser le bot.
const OWNER_ID = '1195042683064942624';

// Une session expire après 15 minutes.
const MAX_AGE_MS = 15 * 60 * 1000;

// Sessions temporaires des questionnaires.
const sessions = new Map();

if (!TOKEN || !CLIENT_ID) {
  console.error(
    'Variables DISCORD_TOKEN et CLIENT_ID obligatoires.'
  );
  process.exit(1);
}

// ============================================
// CLIENT DISCORD
// ============================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ============================================
// LIENS AUTOMATIQUES DES VOUCH RF
// ============================================

const usefulLinks = [
  '**Liens utiles :**',
  '• 🛒 Liste boutiques : https://discord.com/channels/1195047756910309456/1195054550588076176',
  '• 📩 Me contacter : https://discord.com/channels/1195047756910309456/1195054777025958008',
  '• 📢 Partager le serveur : https://discord.gg/zYCc9fDZ3C',
].join('\n');

// ============================================
// GESTION DES SESSIONS
// ============================================

function currentSession(userId) {
  const session = sessions.get(userId);

  if (!session) return null;

  if (Date.now() - session.updated > MAX_AGE_MS) {
    sessions.delete(userId);
    return null;
  }

  return session;
}

function touch(session) {
  session.updated = Date.now();
}

function buttons(...specs) {
  return new ActionRowBuilder().addComponents(
    specs.map(([id, label, style]) =>
      new ButtonBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
    )
  );
}

// ============================================
// PHOTOS
// ============================================

function photoPrompt() {
  return [
    '📸 **Envoie ta première photo directement dans ce salon.**',
    '',
    'Tu as **15 minutes** pour terminer le vouch.',
    '',
    '⚠️ La photo sera visible dans ce salon.',
    'Utilise un salon privé si nécessaire.',
  ].join('\n');
}

function imageFromMessage(message) {
  const attachment = message.attachments.find(
    (a) =>
      a.contentType?.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp)$/i.test(a.name || '')
  );

  return attachment || null;
}

// ============================================
// EMBED DU VOUCH
// ============================================

function vouchTitle(session) {
  const site = session.site.trim().toUpperCase();
  const amount = session.amount.trim();

  const formattedAmount = /€/.test(amount)
    ? amount
    : `${amount}€`;

  return `${site} - ${formattedAmount}`.slice(0, 256);
}

function makeEmbed(session) {
  const description = [
    session.comment ? session.comment.trim() : null,
    usefulLinks,
  ]
    .filter(Boolean)
    .join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle(vouchTitle(session))
    .setDescription(description);

  // Pas de setColor() : aucune couleur personnalisée.

  if (session.photos[0]) {
    embed.setImage(session.photos[0].url);
  }

  return embed;
}

// ============================================
// CHOIX DU SALON + CONFIRMATION
// ============================================

function previewComponents(session) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('market:channel')
    .setPlaceholder('Choisis le salon de publication')
    .addChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement
    )
    .setMinValues(1)
    .setMaxValues(1);

  if (session.targetChannelId) {
    menu.setDefaultChannels(session.targetChannelId);
  }

  return [
    new ActionRowBuilder().addComponents(menu),

    buttons(
      [
        'market:confirm',
        '✅ Confirmer',
        ButtonStyle.Success,
      ],
      [
        'market:cancel',
        '❌ Annuler',
        ButtonStyle.Danger,
      ]
    ),
  ];
}

// ============================================
// PRÉVISUALISATION
// ============================================

async function showPreview(channel, session) {
  session.step = 'preview';
  touch(session);

  const content = [
    '👀 **Prévisualisation RF**',
    '',
    'Aucun vouch n’est encore publié.',
    '',
    '📢 Choisis le salon sous cette prévisualisation.',
    'Puis clique sur **Confirmer**.',
    '',
    session.photos.length === 2
      ? '📸 La deuxième photo sera également publiée.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const preview = await channel.send({
    content,
    embeds: [makeEmbed(session)],
    components: previewComponents(session),
  });

  session.previewMessageId = preview.id;

  if (session.photos[1]) {
    const second = await channel.send({
      content: '📸 **Aperçu de la deuxième photo :**',
      files: [
        new AttachmentBuilder(session.photos[1].url, {
          name: session.photos[1].name || 'photo2.png',
        }),
      ],
    });

    session.previewSecondMessageId = second.id;
  }
}

// ============================================
// COMMANDE /VOUCH
// ============================================

const command = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription(
    'Créer un vouch Zerx Market (réservé au propriétaire)'
  );

// ============================================
// DÉMARRAGE DU BOT
// ============================================

client.once(Events.ClientReady, async (ready) => {
  console.log(`Connecté : ${ready.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      {
        body: [command.toJSON()],
      }
    );

    console.log(
      'Commande /vouch installée sur le serveur Market.'
    );
  } catch (err) {
    console.error(
      'Erreur installation commande :',
      err
    );
  }
});

// ============================================
// INTERACTIONS DISCORD
// ============================================

client.on(Events.InteractionCreate, async (interaction) => {
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isButton() &&
    !interaction.isModalSubmit() &&
    !interaction.isChannelSelectMenu()
  ) {
    return;
  }

  try {
    // Sécurité : toi uniquement.
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content:
          '⛔ Cette commande est réservée au propriétaire de Zerx Market.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Sécurité : serveur Market uniquement.
    if (
      !interaction.inGuild() ||
      interaction.guildId !== GUILD_ID
    ) {
      return interaction.reply({
        content:
          '⛔ Utilise ce bot sur le serveur Market.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ========================================
    // ÉTAPE 1 : /VOUCH
    // ========================================

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'vouch') {
        return;
      }

      sessions.set(OWNER_ID, {
        step: 'type',
        channelId: interaction.channelId,
        updated: Date.now(),
        photos: [],
        targetChannelId: null,
      });

      return interaction.reply({
        content:
          '📋 **De quel type est ce vouch ?**',
        components: [
          buttons(
            [
              'market:rf',
              'RF',
              ButtonStyle.Primary,
            ],
            [
              'market:ue',
              'UE (bientôt)',
              ButtonStyle.Success,
            ]
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ========================================
    // UE : À AJOUTER PLUS TARD
    // ========================================

    if (
      interaction.isButton() &&
      interaction.customId === 'market:ue'
    ) {
      return interaction.reply({
        content:
          '🟢 UE sera ajouté prochainement. Pour le moment, utilise RF.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const session = currentSession(OWNER_ID);

    if (
      !session ||
      session.channelId !== interaction.channelId
    ) {
      return interaction.reply({
        content:
          '⌛ Session introuvable ou expirée. Relance `/vouch`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ========================================
    // ÉTAPE 2 : BOUTON RF
    // ========================================

    if (
      interaction.isButton() &&
      interaction.customId === 'market:rf'
    ) {
      if (session.step !== 'type') {
        return interaction.reply({
          content:
            'Ce formulaire a déjà été ouvert. Relance `/vouch` si nécessaire.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.step = 'form';
      touch(session);

      const modal = new ModalBuilder()
        .setCustomId('market:form')
        .setTitle('Vouch Zerx Market');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('site')
            .setLabel('Nom du Site')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
        ),

        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Montant')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex : 125')
            .setMaxLength(50)
            .setRequired(true)
        ),

        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('comment')
            .setLabel('Commentaire (facultatif)')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(false)
        )
      );

      return interaction.showModal(modal);
    }

    // ========================================
    // ÉTAPE 3 : FORMULAIRE VALIDÉ
    // ========================================

    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'market:form'
    ) {
      if (session.step !== 'form') {
        return interaction.reply({
          content:
            'Formulaire déjà traité. Relance `/vouch`.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.site =
        interaction.fields.getTextInputValue('site');

      session.amount =
        interaction.fields.getTextInputValue('amount');

      session.comment =
        interaction.fields.getTextInputValue('comment') || '';

      session.step = 'photo1';
      touch(session);

      return interaction.reply({
        content: photoPrompt(),
        flags: MessageFlags.Ephemeral,
      });
    }

    // ========================================
    // ÉTAPE 4 : DEUXIÈME PHOTO - OUI
    // ========================================

    if (
      interaction.isButton() &&
      interaction.customId === 'market:photo2yes'
    ) {
      if (session.step !== 'ask2') {
        return interaction.reply({
          content:
            'Cette étape est déjà terminée.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.step = 'photo2';
      touch(session);

      return interaction.update({
        content:
          '📸 **Envoie maintenant ta deuxième photo directement dans ce salon.**',
        components: [],
      });
    }

    // ========================================
    // ÉTAPE 5 : DEUXIÈME PHOTO - NON
    // ========================================

    if (
      interaction.isButton() &&
      interaction.customId === 'market:photo2no'
    ) {
      if (session.step !== 'ask2') {
        return interaction.reply({
          content:
            'Cette étape est déjà terminée.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.update({
        content:
          '✅ Une seule photo sélectionnée. Prévisualisation en cours…',
        components: [],
      });

      return showPreview(
        interaction.channel,
        session
      );
    }

    // ========================================
    // ÉTAPE 6 : CHOIX DU SALON
    // ========================================

    if (
      interaction.isChannelSelectMenu() &&
      interaction.customId === 'market:channel'
    ) {
      if (
        session.step !== 'preview' ||
        session.previewMessageId !== interaction.message.id
      ) {
        return interaction.reply({
          content:
            'Cette prévisualisation n’est plus active.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const id = interaction.values[0];

      const channel =
        await interaction.guild.channels
          .fetch(id)
          .catch(() => null);

      if (
        !channel ||
        !channel.isTextBased() ||
        !channel.send
      ) {
        return interaction.reply({
          content:
            '⛔ Salon non compatible.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const perms = channel.permissionsFor(
        interaction.guild.members.me
      );

      if (
        !perms?.has('ViewChannel') ||
        !perms?.has('SendMessages') ||
        !perms?.has('EmbedLinks') ||
        !perms?.has('AttachFiles')
      ) {
        return interaction.reply({
          content:
            '⛔ Le bot doit avoir les permissions Voir le salon, Envoyer des messages, Intégrer des liens et Joindre des fichiers.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.targetChannelId = id;
      touch(session);

      return interaction.update({
        components: previewComponents(session),
      });
    }

    // ========================================
    // ÉTAPE 7 : ANNULER
    // ========================================

    if (
      interaction.isButton() &&
      interaction.customId === 'market:cancel'
    ) {
      if (
        session.step !== 'preview' ||
        session.previewMessageId !== interaction.message.id
      ) {
        return interaction.reply({
          content:
            'Cette prévisualisation n’est plus active.',
          flags: MessageFlags.Ephemeral,
        });
      }

      sessions.delete(OWNER_ID);

      return interaction.update({
        content:
          '❌ Vouch annulé. Rien n’a été publié.',
        embeds: [],
        components: [],
      });
    }

    // ========================================
    // ÉTAPE 8 : CONFIRMER ET PUBLIER
    // ========================================

    if (
      interaction.isButton() &&
      interaction.customId === 'market:confirm'
    ) {
      if (
        session.step !== 'preview' ||
        session.previewMessageId !== interaction.message.id
      ) {
        return interaction.reply({
          content:
            'Cette prévisualisation n’est plus active.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!session.targetChannelId) {
        return interaction.reply({
          content:
            '📢 Choisis d’abord un salon de publication dans le menu.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.step = 'publishing';
      touch(session);

      await interaction.deferUpdate();

      try {
        const channel =
          await interaction.guild.channels.fetch(
            session.targetChannelId
          );

        if (!channel?.send) {
          throw new Error('Salon indisponible');
        }

        const files = session.photos.map(
          (photo, i) =>
            new AttachmentBuilder(photo.url, {
              name: `vouch-${i + 1}.${photo.ext}`,
            })
        );

        const embed = makeEmbed(session);

        // Photo principale intégrée dans l'embed.
        if (files.length) {
          embed.setImage(
            `attachment://vouch-1.${session.photos[0].ext}`
          );
        }

        const published = await channel.send({
          embeds: [embed],
          files,
        });

        sessions.delete(OWNER_ID);

        await interaction.message.edit({
          content:
            `✅ **Vouch RF publié !**\n🔗 ${published.url}`,
          embeds: [],
          components: [],
        });
      } catch (error) {
        console.error(
          'Publication échouée :',
          error
        );

        session.step = 'preview';

        await interaction.message
          .edit({
            content:
              '❌ Publication impossible. Vérifie les permissions du bot puis réessaie.',
            components: previewComponents(session),
          })
          .catch(() => {});
      }

      return;
    }
  } catch (error) {
    console.error(
      'Erreur interaction :',
      error
    );

    const payload = {
      content:
        '❌ Une erreur est survenue. Relance `/vouch` si nécessaire.',
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// ============================================
// RÉCEPTION DES PHOTOS DIRECTEMENT SUR DISCORD
// ============================================

client.on(Events.MessageCreate, async (message) => {
  if (
    message.author.bot ||
    message.author.id !== OWNER_ID ||
    message.guildId !== GUILD_ID
  ) {
    return;
  }

  const session = currentSession(OWNER_ID);

  if (
    !session ||
    session.channelId !== message.channelId ||
    !['photo1', 'photo2'].includes(session.step)
  ) {
    return;
  }

  const attachment = imageFromMessage(message);

  if (!attachment) return;

  // Empêcher le traitement en double.
  const expectedStep = session.step;

  session.step = 'processing';
  touch(session);

  const ext =
    /\.(png|jpe?g|gif|webp)$/i.exec(
      attachment.name || ''
    )?.[1]?.toLowerCase() || 'png';

  session.photos.push({
    url: attachment.url,
    name: attachment.name,
    ext,
  });

  try {
    if (expectedStep === 'photo1') {
      session.step = 'ask2';
      touch(session);

      await message.reply({
        content:
          '📸 **As-tu une 2e photo à ajouter ?**',
        components: [
          buttons(
            [
              'market:photo2yes',
              'Oui',
              ButtonStyle.Success,
            ],
            [
              'market:photo2no',
              'Non',
              ButtonStyle.Danger,
            ]
          ),
        ],
      });
    } else {
      await showPreview(
        message.channel,
        session
      );
    }
  } catch (error) {
    console.error(
      'Erreur photo :',
      error
    );

    session.step = expectedStep;
    session.photos.pop();

    await message
      .reply(
        '❌ Impossible de traiter cette photo. Réessaie.'
      )
      .catch(() => {});
  }
});

// ============================================
// CONNEXION
// ============================================

client.login(TOKEN);
